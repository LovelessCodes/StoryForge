//! Shared scaffolding for importing other launchers' instances as profiles.
//!
//! Every launcher importer follows the same shape: enumerate the other
//! launcher's instances, describe them for the UI, then move or copy the
//! chosen folders into the profiles root and write a `profile.json` manifest
//! next to a migration log that keeps already-imported folders from being
//! imported twice.
//!
//! This module owns the shared parts of that shape:
//!
//! * the copy/move engine ([`ImportSession`], [`copy_profile_dir`],
//!   [`move_profile_dir`]) with progress reporting and cancellation,
//! * the shared record types ([`DetectedInstance`], [`ImportSkip`],
//!   [`ImportReport`], [`MigrationLog`]),
//! * the generic detect/import driver ([`detect_all`], [`run_import`]) that
//!   each launcher plugs into through the [`ImportSource`] trait.
//!
//! The eight launcher modules keep only their root resolution, their own file
//! formats and the per-module deltas; `legacy` keeps its own flow and on-disk
//! formats but imports the engine from here.

use std::{
    collections::HashSet,
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, rename, write, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventId, Listener, Manager};
use tokio_util::sync::CancellationToken;
use walkdir::WalkDir;

use super::errors::UiError;
use super::mod_store;
use super::paths::{PROFILE_JSON, SAVES_DIR};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    dir_name, dir_size_cached_recent, format_size, normalize_path, profiles_folder,
    profiles_subdir, require_managed_path, CleanupTarget, Throttle,
};
use crate::{log_error, log_info};

/// One step of an import, streamed to the UI on the run's event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationProgress {
    pub phase: &'static str,
    pub folder: String,
    pub index: usize,
    pub count: usize,
    pub bytes: u64,
    pub bytes_total: Option<u64>,
}

/// Progress and cancellation for one folder copy.
pub(crate) trait CopyObserver {
    fn cancelled(&self) -> bool;

    fn advance(&mut self, bytes: u64);
}

pub(crate) fn cancelled_error() -> UiError {
    UiError::new("cancelled", "Import cancelled")
}

/// Streams progress for one import run and answers cancellation.
///
/// Reporting sessions emit [`MigrationProgress`] on the run's Tauri event and
/// cancel when the UI sends `<event>:cancel`; a run without an event name (or
/// without a UI) gets a silent session.
pub(crate) struct ImportSession {
    app: AppHandle,
    event: Option<String>,
    token: CancellationToken,
    listener: Option<EventId>,
    throttle: Throttle,
    phase: &'static str,
    folder: String,
    index: usize,
    count: usize,
    bytes: u64,
    bytes_total: Option<u64>,
}

impl ImportSession {
    pub(crate) fn create(app: &AppHandle, event: Option<String>, count: usize) -> Self {
        let token = CancellationToken::new();
        let listener = event.as_ref().map(|name| {
            let token = token.clone();
            app.listen(format!("{name}:cancel"), move |_| token.cancel())
        });
        Self {
            app: app.clone(),
            event,
            token,
            listener,
            throttle: Throttle::new(Duration::from_millis(100)),
            phase: "copy",
            folder: String::new(),
            index: 0,
            count,
            bytes: 0,
            bytes_total: None,
        }
    }

    /// Starts the `index`-th (1-based) folder of this run, with `phase` naming
    /// what is about to happen to it (`copy` or `move`).
    pub(crate) fn begin_folder(
        &mut self,
        folder: &str,
        source: &Path,
        index: usize,
        phase: &'static str,
    ) {
        self.phase = phase;
        self.folder = folder.to_string();
        self.index = index;
        self.bytes = 0;
        self.bytes_total = dir_size_cached_recent(source);
        self.emit();
    }

    /// The folder is copied; the manifest conversion is next.
    pub(crate) fn finish_folder(&mut self) {
        self.phase = "convert";
        self.emit();
    }

    pub(crate) fn finish(&mut self) {
        self.phase = "done";
        self.emit();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    pub(crate) fn ensure_running(&self) -> Result<(), UiError> {
        if self.is_cancelled() {
            Err(cancelled_error())
        } else {
            Ok(())
        }
    }

    fn emit(&self) {
        let Some(event) = self.event.as_ref() else {
            return;
        };
        let _ = self.app.emit(
            event,
            MigrationProgress {
                phase: self.phase,
                folder: self.folder.clone(),
                index: self.index,
                count: self.count,
                bytes: self.bytes,
                bytes_total: self.bytes_total,
            },
        );
    }
}

impl CopyObserver for ImportSession {
    fn cancelled(&self) -> bool {
        self.is_cancelled()
    }

    fn advance(&mut self, bytes: u64) {
        self.bytes += bytes;
        if self.throttle.ready() {
            self.emit();
        }
    }
}

impl Drop for ImportSession {
    fn drop(&mut self) {
        if let Some(id) = self.listener.take() {
            self.app.unlisten(id);
        }
    }
}

/// Deletes staging folders under `root`, returning how many were removed.
///
/// Only ever called at startup: a copy can leave its staging folder behind by
/// being killed (crash or force-quit), and single-instance means nothing can be
/// writing into one at that point. A partial copy is never reused, so removing
/// it just reclaims the disk the killed run left behind.
fn sweep_staging_dir(root: &Path) -> usize {
    let Ok(entries) = read_dir(root) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with(".staging-") {
            continue;
        }
        let path = entry.path();
        if remove_dir_all(&path).is_ok() {
            log_info!("legacy: removed import leftovers at {}", path.display());
            removed += 1;
        }
    }
    removed
}

/// Reclaims staging folders an interrupted import left in the profiles root.
pub fn sweep_staging_leftovers(app: &AppHandle) {
    let Ok(root) = profiles_folder(app.clone()) else {
        return;
    };
    sweep_staging_dir(&root.join(profiles_subdir(app.clone())));
}

/// Copies one file in chunks, reporting every chunk to `observer`.
///
/// `std::fs::copy` copies a file in one call, so cancelling could not take
/// effect until a multi-gigabyte save or archive was fully copied; the chunked
/// loop stops at the next chunk instead.
fn copy_file(source: &Path, target: &Path, observer: &mut dyn CopyObserver) -> Result<(), UiError> {
    const CHUNK: usize = 4 * 1024 * 1024;

    let mut input = File::open(source).map_err(|e| {
        UiError::new(
            "copy_failed",
            format!("Failed to open {}: {e}", source.display()),
        )
    })?;
    let mut output = File::create(target).map_err(|e| {
        UiError::new(
            "copy_failed",
            format!("Failed to create {}: {e}", target.display()),
        )
    })?;
    let mut buffer = vec![0u8; CHUNK];
    loop {
        if observer.cancelled() {
            return Err(cancelled_error());
        }
        let read = input.read(&mut buffer).map_err(|e| {
            UiError::new(
                "copy_failed",
                format!("Failed to read {}: {e}", source.display()),
            )
        })?;
        if read == 0 {
            break;
        }
        output.write_all(&buffer[..read]).map_err(|e| {
            UiError::new(
                "copy_failed",
                format!("Failed to write {}: {e}", target.display()),
            )
        })?;
        observer.advance(read as u64);
    }

    // Mirror std::fs::copy: the copy keeps the source's permissions.
    if let Ok(metadata) = input.metadata() {
        let _ = std::fs::set_permissions(target, metadata.permissions());
    }
    Ok(())
}

/// Copies the tree under `source` into `target`, reporting every file to
/// `observer` and stopping when it is cancelled.
///
/// Symlinks are not followed (walkdir does not descend into them), so a
/// self-referential junction cannot make the copy run forever; a linked file is
/// copied as its content, a linked folder stays an empty folder.
fn copy_tree(source: &Path, target: &Path, observer: &mut dyn CopyObserver) -> Result<(), UiError> {
    create_dir_all(target).map_err(|e| {
        UiError::new(
            "copy_failed",
            format!("Failed to create {}: {e}", target.display()),
        )
    })?;

    for entry in WalkDir::new(source).follow_links(false) {
        if observer.cancelled() {
            return Err(cancelled_error());
        }
        let entry = entry.map_err(|e| {
            UiError::new(
                "copy_failed",
                format!("Failed to read {}: {e}", source.display()),
            )
        })?;
        let relative = entry.path().strip_prefix(source).map_err(|e| {
            UiError::new(
                "copy_failed",
                format!("Failed to read {}: {e}", entry.path().display()),
            )
        })?;
        if relative.as_os_str().is_empty() {
            continue;
        }
        let destination = target.join(relative);
        let file_type = entry.file_type();
        if file_type.is_dir() {
            create_dir_all(&destination).map_err(|e| {
                UiError::new(
                    "copy_failed",
                    format!("Failed to create {}: {e}", destination.display()),
                )
            })?;
        } else if entry.path().is_file() {
            copy_file(entry.path(), &destination, observer)?;
        } else if entry.path().is_dir() {
            // A linked folder: keep the shape, but do not copy its content.
            create_dir_all(&destination).map_err(|e| {
                UiError::new(
                    "copy_failed",
                    format!("Failed to create {}: {e}", destination.display()),
                )
            })?;
        }
    }
    Ok(())
}

fn staging_dir(root: &Path) -> PathBuf {
    root.join(format!(".staging-{}", now_nanos()))
}

/// Copies `source` to a freshly chosen target folder via a hidden staging dir,
/// so a collision or a partial copy can never touch an existing profile.
///
/// Progress is reported to `observer`, which can also cancel: a cancelled or
/// failed copy leaves nothing behind, so the import can be retried.
pub(crate) fn copy_profile_dir(
    root: &Path,
    source: &Path,
    folder: &str,
    observer: &mut dyn CopyObserver,
) -> Result<PathBuf, UiError> {
    let target = free_profile_dir(root, folder);
    let staging = staging_dir(root);
    let mut cleanup = CleanupTarget::defer(staging.clone());
    create_dir_all(&staging).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create staging folder: {e}"),
        )
    })?;

    copy_tree(source, &staging, observer)?;

    rename(&staging, &target).map_err(|e| {
        UiError::new(
            "copy_failed",
            format!("Failed to move {folder} into the profiles folder: {e}"),
        )
    })?;
    cleanup.defuse();
    Ok(target)
}

/// Moves `source` into the profiles root under a free name, reporting progress.
///
/// A same-volume rename is instant; across volumes the folder goes through the
/// same staging path as [`copy_profile_dir`] and the source is removed only once
/// the copy is in place, so cancelling never leaves a half-moved profile.
pub(crate) fn move_profile_dir(
    root: &Path,
    source: &Path,
    folder: &str,
    observer: &mut dyn CopyObserver,
) -> Result<PathBuf, UiError> {
    let target = free_profile_dir(root, folder);
    if rename(source, &target).is_ok() {
        return Ok(target);
    }

    let staging = staging_dir(root);
    let mut cleanup = CleanupTarget::defer(staging.clone());
    create_dir_all(&staging).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create staging folder: {e}"),
        )
    })?;

    copy_tree(source, &staging, observer)?;

    rename(&staging, &target).map_err(|e| {
        UiError::new(
            "move_failed",
            format!("Failed to move {folder} into the profiles folder: {e}"),
        )
    })?;
    cleanup.defuse();

    remove_dir_all(source).map_err(|e| {
        UiError::new(
            "remove_failed",
            format!("Failed to remove {folder} after moving it: {e}"),
        )
    })?;
    Ok(target)
}

pub(crate) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })
}

pub(crate) fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Returns a free folder inside the profiles root, suffixing on collisions.
pub(crate) fn free_profile_dir(root: &Path, folder: &str) -> PathBuf {
    let candidate = root.join(folder);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..=50u32 {
        let candidate = root.join(format!("{folder}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    root.join(format!("{folder}-{}", now_nanos()))
}

// --- Shared records for the launcher importers ---

/// One launcher instance as the import UI lists it.
///
/// Every launcher importer reports this exact shape (no serde renames: the
/// serialized names are these snake_case field names).
#[derive(Debug, Clone, Serialize)]
pub struct DetectedInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

/// One folder an import could not bring over, with the reason why.
#[derive(Debug, Clone, Serialize)]
pub struct ImportSkip {
    pub name: String,
    pub reason: String,
}

/// The result of one import run.
#[derive(Debug, Clone, Serialize)]
pub struct ImportReport {
    pub migrated: usize,
    pub skipped: Vec<ImportSkip>,
}

/// One imported folder, as recorded in a launcher's migration log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct MigrationEntry {
    pub source_path: String,
    pub target_path: String,
    pub name: String,
}

/// The shared migration log of a launcher importer.
#[derive(Debug, Default, Serialize, Deserialize)]
pub(crate) struct MigrationLog {
    #[serde(default)]
    pub migrations: Vec<MigrationEntry>,
}

fn migration_log_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, UiError> {
    Ok(app_data_dir(app)?.join(file_name))
}

/// Reads a launcher's migration log; a missing or unreadable file reads as empty.
pub(crate) fn read_migration_log(app: &AppHandle, file_name: &str) -> MigrationLog {
    migration_log_path(app, file_name)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

/// Replaces a launcher's migration log with `log`.
pub(crate) fn write_migration_log(
    app: &AppHandle,
    file_name: &str,
    log: &MigrationLog,
) -> Result<(), UiError> {
    let path = migration_log_path(app, file_name)?;
    let content = serde_json::to_string_pretty(log)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize log: {e}")))?;
    write(&path, content).map_err(|e| {
        UiError::new(
            "write_failed",
            format!("Failed to write migration log: {e}"),
        )
    })
}

/// True when `source_path` was already imported into a still-existing profile.
pub(crate) fn is_already_imported(log: &MigrationLog, source_path: &Path) -> bool {
    log.migrations.iter().any(|entry| {
        normalize_path(Path::new(&entry.source_path)) == normalize_path(source_path)
            && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
    })
}

// --- Shared stat helpers (only where the launchers are truly identical) ---

/// Number of `.zip` archives directly inside `mods_dir`.
pub(crate) fn count_mod_zips(mods_dir: &Path) -> usize {
    read_dir(mods_dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| {
                    entry.path().is_file()
                        && entry
                            .path()
                            .extension()
                            .map(|ext| ext.eq_ignore_ascii_case("zip"))
                            .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

/// Whether a game data folder holds a `Saves` directory.
pub(crate) fn has_saves(data_dir: &Path) -> bool {
    data_dir.join(SAVES_DIR).is_dir()
}

/// Whether a data folder is one of the game's default data folders.
pub(crate) fn is_default_game_data(data_dir: &Path) -> bool {
    super::game_data::default_data_candidates()
        .iter()
        .any(|candidate| normalize_path(candidate) == normalize_path(data_dir))
}

/// The byte count plus its display form, as every detected instance reports both.
pub(crate) fn size_fields(size_bytes: u64) -> (u64, String) {
    (size_bytes, format_size(size_bytes))
}

// --- The import driver ---

/// How the driver places an imported item into the profiles folder.
#[derive(Clone, Copy)]
pub(crate) enum Placement {
    /// Move or copy the item's folder as a whole, with progress reporting.
    WholeDir,
    /// Copy selected parts of the item into a staged profile folder.
    Selective,
}

/// When the driver writes the migration log.
#[derive(Clone, Copy)]
pub(crate) enum LogWrite {
    /// After every imported folder; a failed write is logged and the run
    /// continues, so folders already imported are never re-imported.
    PerFolder,
    /// Once after the loop; a failed write fails the command.
    AtEnd,
}

/// What one launcher contributes to the shared detect/import driver.
pub(crate) trait ImportSource {
    type Item: Clone;

    /// File name of this launcher's migration log inside the app data dir.
    fn log_file(&self) -> &'static str;

    /// Prefix of this module's log lines (e.g. `cairn`).
    fn label(&self) -> &'static str;

    /// Noun in the `"<label>: found N ..."` log line (e.g. `pack(s)`).
    fn found_noun(&self) -> &'static str;

    /// Scans the launcher's own data; `None` when its data source cannot be
    /// located at all (detect then reports nothing, an import fails with
    /// [`ImportSource::missing_source_error`]).
    fn scan(&self, app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError>;

    /// Error an import fails with when [`ImportSource::scan`] found no source.
    fn missing_source_error(&self) -> UiError;

    /// Reason for a requested path that is not part of the scan.
    fn not_listed_reason(&self) -> &'static str;

    /// Reason for a listed item whose source folder disappeared.
    fn missing_folder_reason(&self) -> &'static str;

    /// Module-specific visibility filter of detect (a folder that cannot be
    /// listed at all is not described).
    fn detectable(&self, _item: &Self::Item) -> bool {
        true
    }

    /// Whether detect drops repeated items (same normalized source path).
    fn dedupes_detected_paths(&self) -> bool {
        false
    }

    /// Whether an empty scan stops detect before the migration log and the
    /// profiles folder are touched.
    fn stops_detect_when_empty(&self) -> bool {
        true
    }

    /// Whether detect sorts its results by display name.
    fn sorts_detected_names(&self) -> bool {
        false
    }

    fn describe(&self, item: &Self::Item, log: &MigrationLog) -> DetectedInstance;

    /// Whether `requested` (a path from the UI) names this item.
    fn matches(&self, item: &Self::Item, requested: &str) -> bool {
        normalize_path(Path::new(requested)) == normalize_path(&self.source_path(item))
    }

    fn source_path(&self, item: &Self::Item) -> PathBuf;

    fn display_name(&self, item: &Self::Item) -> String;

    /// Folder name the item imports under (before collision suffixing).
    fn target_folder(&self, item: &Self::Item) -> String {
        dir_name(&self.source_path(item))
    }

    /// Whether an empty or `.`-prefixed target folder is rejected with the
    /// `invalid folder name` skip (the modules that use the raw folder name).
    fn validates_folder_name(&self) -> bool {
        false
    }

    fn placement(&self) -> Placement;

    /// Copies the parts of `item` that belong in a profile into `profile_dir`.
    ///
    /// Only called for [`Placement::Selective`].
    fn stage(
        &self,
        _app: &AppHandle,
        _item: &Self::Item,
        _profile_dir: &Path,
    ) -> Result<(), UiError> {
        unreachable!("stage is only called for selective placement")
    }

    /// Noun in the selective rename error (e.g. `pack`, `instance`).
    fn staged_noun(&self) -> &'static str {
        "profile"
    }

    /// Writes the item's metadata over the freshly placed profile manifest.
    fn apply_profile(&self, item: &Self::Item, info: &mut ProfileInfo);

    /// Runs after the folder is in place and before `profile.json` is read.
    fn post_place(
        &self,
        _app: &AppHandle,
        _item: &Self::Item,
        _target: &Path,
    ) -> Result<(), UiError> {
        Ok(())
    }

    fn log_write(&self) -> LogWrite;
}

/// Lists everything `source` can import.
///
/// Items that are already inside the profiles folder (or registered as an
/// external profile) are never listed; the migration log marks previously
/// imported ones.
pub(crate) fn detect_all<A: ImportSource>(
    app: &AppHandle,
    source: &A,
) -> Result<Vec<DetectedInstance>, UiError> {
    let Some(items) = source.scan(app)? else {
        return Ok(Vec::new());
    };
    if items.is_empty() && source.stops_detect_when_empty() {
        return Ok(Vec::new());
    }

    let log = read_migration_log(app, source.log_file());
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut results = Vec::new();

    for item in &items {
        if !source.detectable(item) {
            continue;
        }
        let path = source.source_path(item);
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }
        // Launchers whose configs can list the same folder twice only report it once.
        if source.dedupes_detected_paths() && !seen.insert(normalize_path(&path)) {
            continue;
        }
        results.push(source.describe(item, &log));
    }

    if source.sorts_detected_names() {
        results.sort_by_key(|item| item.name.to_lowercase());
    }
    log_info!(
        "{}: found {} {}",
        source.label(),
        results.len(),
        source.found_noun()
    );
    Ok(results)
}

/// Imports the `requested` folders into the profiles folder.
///
/// `mode` is `"move"` or `"copy"` for [`Placement::WholeDir`] sources (and is
/// validated here); selective sources are copy-only and ignore it. `event`
/// names the Tauri event that carries progress for whole-folder runs.
///
/// The [`ImportSession`] (and its cancel listener) is created before the
/// blocking task is spawned, so a cancel that arrives while the task is still
/// queued is not lost.
pub(crate) async fn run_import<A: ImportSource + Send + 'static>(
    app: AppHandle,
    source: A,
    requested: Vec<String>,
    mode: Option<String>,
    event: Option<String>,
) -> Result<ImportReport, UiError> {
    let mode = match source.placement() {
        Placement::WholeDir => {
            let mode = mode.unwrap_or_default();
            if mode != "move" && mode != "copy" {
                return Err(UiError::new(
                    "invalid_mode",
                    "Import mode must be \"move\" or \"copy\"",
                ));
            }
            mode
        }
        Placement::Selective => "copy".to_string(),
    };
    let mut session = match source.placement() {
        Placement::WholeDir => Some(ImportSession::create(&app, event, requested.len())),
        Placement::Selective => None,
    };
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        run_import_blocking(&handle, &source, requested, mode, &mut session)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}

/// Synchronous core of [`run_import`]: drives one import over the requested
/// folders. `mode` is already validated, and `session` is only set for
/// whole-folder sources.
fn run_import_blocking<A: ImportSource>(
    app: &AppHandle,
    source: &A,
    requested: Vec<String>,
    mode: String,
    session: &mut Option<ImportSession>,
) -> Result<ImportReport, UiError> {
    let Some(items) = source.scan(app)? else {
        return Err(source.missing_source_error());
    };

    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    create_dir_all(&profiles_root).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create profiles folder: {e}"),
        )
    })?;

    let mut log = read_migration_log(app, source.log_file());
    let mut report = ImportReport {
        migrated: 0,
        skipped: Vec::new(),
    };

    for (index, requested_path) in requested.into_iter().enumerate() {
        if let Some(session) = session.as_mut() {
            session.ensure_running()?;
        }

        let Some(item) = items
            .iter()
            .find(|item| source.matches(item, &requested_path))
        else {
            report.skipped.push(ImportSkip {
                name: requested_path,
                reason: source.not_listed_reason().into(),
            });
            continue;
        };

        let source_path = source.source_path(item);
        let name = source.display_name(item);
        if !source_path.is_dir() {
            report.skipped.push(ImportSkip {
                name,
                reason: source.missing_folder_reason().into(),
            });
            continue;
        }
        let folder = source.target_folder(item);
        if source.validates_folder_name() && (folder.is_empty() || folder.starts_with('.')) {
            report.skipped.push(ImportSkip {
                name,
                reason: "invalid folder name".into(),
            });
            continue;
        }
        if normalize_path(&source_path).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(ImportSkip {
                name,
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source_path) {
            report.skipped.push(ImportSkip {
                name,
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        if let Some(session) = session.as_mut() {
            let phase = if mode == "move" { "move" } else { "copy" };
            session.begin_folder(&folder, &source_path, index + 1, phase);
        }

        let placed: Result<PathBuf, UiError> = match source.placement() {
            Placement::WholeDir => {
                let session = session
                    .as_mut()
                    .expect("whole-dir placement runs with a session");
                if mode == "move" {
                    let target = free_profile_dir(&profiles_root, &folder);
                    require_managed_path(app, &target, "profile")?;
                    move_profile_dir(&profiles_root, &source_path, &folder, session)
                } else {
                    copy_profile_dir(&profiles_root, &source_path, &folder, session)
                }
            }
            Placement::Selective => {
                let target = free_profile_dir(&profiles_root, &folder);
                let staging = staging_dir(&profiles_root);
                let result = (|| -> Result<(), UiError> {
                    create_dir_all(&staging).map_err(|e| {
                        UiError::new(
                            "create_dir_failed",
                            format!("failed to create staging folder: {e}"),
                        )
                    })?;
                    let staged_profile = staging.join("profile");
                    create_dir_all(&staged_profile).map_err(|e| {
                        UiError::new(
                            "create_dir_failed",
                            format!("failed to create the profile folder: {e}"),
                        )
                    })?;
                    source.stage(app, item, &staged_profile)?;
                    rename(&staged_profile, &target).map_err(|e| {
                        UiError::new(
                            "copy_failed",
                            format!(
                                "failed to move the copied {} into place: {e}",
                                source.staged_noun()
                            ),
                        )
                    })
                })();
                let _ = remove_dir_all(&staging);
                result.map(|()| target)
            }
        };

        let target = match placed {
            Ok(target) => target,
            Err(error) => {
                if session
                    .as_ref()
                    .is_some_and(|session| session.is_cancelled())
                {
                    return Err(cancelled_error());
                }
                report.skipped.push(ImportSkip {
                    name,
                    reason: error.message,
                });
                continue;
            }
        };
        if let Some(session) = session.as_mut() {
            session.finish_folder();
        }

        source.post_place(app, item, &target)?;

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: name.clone(),
            ..Default::default()
        });
        source.apply_profile(item, &mut info);

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(ImportSkip {
                name,
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        // Imported launchers copy each mod into the new profile. Link them into
        // the shared store now so importing a large library does not double
        // every mod on disk. Failure only costs deduplication, never the import.
        if let Ok(Some(store)) = mod_store::for_app(app) {
            match mod_store::optimize_profile(&store, &target) {
                Ok(result) => log_info!(
                    "{}: linked {} mod(s) into the shared store for {}",
                    source.label(),
                    result.linked,
                    info.name
                ),
                Err(error) => log_error!(
                    "{}: could not deduplicate {}: {}",
                    source.label(),
                    info.name,
                    error.message
                ),
            }
        }

        log_info!("{}: imported {} ({})", source.label(), info.name, mode);
        log.migrations.push(MigrationEntry {
            source_path: source_path.to_string_lossy().to_string(),
            target_path: target.to_string_lossy().to_string(),
            name: info.name.clone(),
        });
        report.migrated += 1;
        if let LogWrite::PerFolder = source.log_write() {
            if let Err(e) = write_migration_log(app, source.log_file(), &log) {
                log_error!(
                    "{}: failed to record the import log: {}",
                    source.label(),
                    e.message
                );
            }
        }
    }

    if let Some(session) = session.as_mut() {
        session.finish();
    }
    if let LogWrite::AtEnd = source.log_write() {
        if report.migrated > 0 {
            write_migration_log(app, source.log_file(), &log)?;
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Records copied bytes and can cancel once `cancel_after` was reached.
    #[derive(Default)]
    struct TestObserver {
        bytes: u64,
        cancel_after: Option<u64>,
    }

    impl CopyObserver for TestObserver {
        fn cancelled(&self) -> bool {
            self.cancel_after.is_some_and(|limit| self.bytes >= limit)
        }

        fn advance(&mut self, bytes: u64) {
            self.bytes += bytes;
        }
    }

    fn write_tree(root: &Path, files: &[(&str, usize)]) {
        for (relative, size) in files {
            let path = root.join(relative);
            std::fs::create_dir_all(path.parent().expect("file has a parent"))
                .expect("create folder");
            std::fs::write(&path, vec![b'x'; *size]).expect("write file");
        }
    }

    fn profiles_dir(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "storyforge-importer-{}-{name}/profiles",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(root.parent().expect("profiles root has a parent"));
        std::fs::create_dir_all(&root).expect("create profiles folder");
        root
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "storyforge-importer-{}-{name}/source",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    fn staging_leftovers(root: &Path) -> Vec<PathBuf> {
        read_dir(root)
            .expect("read profiles folder")
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .is_some_and(|name| name.to_string_lossy().starts_with(".staging-"))
            })
            .collect()
    }

    #[test]
    fn copy_imports_the_tree_and_reports_its_bytes() {
        let profiles = profiles_dir("copy-root");
        let source = scratch("copy-source");
        write_tree(
            &source,
            &[
                ("Mods/mod.zip", 16),
                ("Saves/save.sav", 8),
                ("ModConfig/mod.cfg", 8),
            ],
        );

        let mut observer = TestObserver::default();
        let target = copy_profile_dir(&profiles, &source, "profile", &mut observer)
            .expect("copy the folder");

        assert_eq!(target, profiles.join("profile"));
        assert_eq!(observer.bytes, 32);
        assert!(target.join("Mods/mod.zip").is_file());
        assert!(target.join("Saves/save.sav").is_file());
        assert!(target.join("ModConfig/mod.cfg").is_file());
        assert!(source.join("Mods/mod.zip").is_file());
        assert!(staging_leftovers(&profiles).is_empty());
        let _ = std::fs::remove_dir_all(source);
    }

    #[test]
    fn a_cancelled_copy_leaves_nothing_behind() {
        let profiles = profiles_dir("cancel-root");
        let source = scratch("cancel-source");
        write_tree(&source, &[("Mods/first.zip", 16), ("Mods/second.zip", 16)]);

        // Cancel once the first file is copied: the copy stops mid-run, with
        // content already staged that must not be left behind.
        let mut observer = TestObserver {
            cancel_after: Some(16),
            ..TestObserver::default()
        };
        let error = copy_profile_dir(&profiles, &source, "profile", &mut observer)
            .expect_err("cancelled copy must fail");

        assert_eq!(error.name, "cancelled");
        assert_eq!(observer.bytes, 16);
        assert!(!profiles.join("profile").exists());
        assert!(staging_leftovers(&profiles).is_empty());
        assert!(source.join("Mods/first.zip").is_file());
        assert!(source.join("Mods/second.zip").is_file());
        let _ = std::fs::remove_dir_all(source);
    }

    #[test]
    fn a_move_relocates_the_folder_and_removes_the_source() {
        let profiles = profiles_dir("move-root");
        let source = scratch("move-source");
        write_tree(&source, &[("Mods/mod.zip", 16)]);

        let mut observer = TestObserver::default();
        let target = move_profile_dir(&profiles, &source, "profile", &mut observer)
            .expect("move the folder");

        assert_eq!(target, profiles.join("profile"));
        assert!(target.join("Mods/mod.zip").is_file());
        assert!(!source.exists());
        assert!(staging_leftovers(&profiles).is_empty());
    }

    #[test]
    fn a_name_collision_imports_under_a_suffixed_name() {
        let profiles = profiles_dir("collision-root");
        let source = scratch("collision-source");
        write_tree(&source, &[("Mods/mod.zip", 16)]);
        std::fs::create_dir_all(profiles.join("profile")).expect("create existing profile");
        std::fs::write(profiles.join("profile/keep.txt"), "keep").expect("write existing file");

        let mut observer = TestObserver::default();
        let target = copy_profile_dir(&profiles, &source, "profile", &mut observer)
            .expect("copy the folder");

        assert_eq!(target, profiles.join("profile-2"));
        assert!(target.join("Mods/mod.zip").is_file());
        assert!(profiles.join("profile/keep.txt").is_file());
        let _ = std::fs::remove_dir_all(source);
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_folder_is_kept_but_not_copied() {
        let profiles = profiles_dir("symlink-root");
        let source = scratch("symlink-source");
        write_tree(&source, &[("Mods/mod.zip", 16)]);
        // A folder linking to itself must not make the copy run forever.
        std::os::unix::fs::symlink(&source, source.join("loop")).expect("create symlink");

        let mut observer = TestObserver::default();
        let target = copy_profile_dir(&profiles, &source, "profile", &mut observer)
            .expect("copy the folder");

        assert!(target.join("Mods/mod.zip").is_file());
        let loop_dir = target.join("loop");
        assert!(loop_dir.is_dir());
        assert_eq!(read_dir(&loop_dir).expect("read linked folder").count(), 0);
        let _ = std::fs::remove_dir_all(source);
    }

    #[test]
    fn the_staging_sweep_removes_leftovers_only() {
        let profiles = profiles_dir("sweep-root");
        std::fs::create_dir_all(profiles.join(".staging-1/Mods")).expect("create leftover");
        std::fs::create_dir_all(profiles.join(".staging-2")).expect("create leftover");
        std::fs::create_dir_all(profiles.join("profile")).expect("create profile");

        assert_eq!(sweep_staging_dir(&profiles), 2);
        assert!(!profiles.join(".staging-1").exists());
        assert!(!profiles.join(".staging-2").exists());
        assert!(profiles.join("profile").exists());
        assert!(staging_leftovers(&profiles).is_empty());
    }
}
