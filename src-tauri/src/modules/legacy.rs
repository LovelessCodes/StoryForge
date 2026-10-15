//! Migration of "installations" from the previous Story Forge release.
//!
//! A legacy installation folder is the same data as a profile (Mods, Saves,
//! Maps, ModConfig, Logs, clientsettings.json) — only the manifest file is
//! named differently (`installation.json` vs `profile.json`). Migration places
//! the folder in the profiles root (move or copy, at the user's choice) and
//! converts the manifest, preserving display name, version, playtime,
//! favorite flag, icon and environment variables.
//!
//! Completed migrations are recorded in `<app data>/legacy-migration.json`, so
//! the UI can tell "already imported" apart from a folder-name collision (a
//! collision imports under a suffixed folder name instead of failing).
//!
//! The legacy folder location is read from the previous app's persisted
//! settings (`store/settings.json`), falling back to
//! `<app data>/installations`.

use std::{
    fs::{
        create_dir_all, read_dir, read_to_string, remove_dir_all, remove_file, rename, write, File,
    },
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Emitter, EventId, Listener, Manager};
use tokio_util::sync::CancellationToken;
use walkdir::WalkDir;

use super::errors::UiError;
use super::paths::{MODS_DIR, PROFILE_JSON};
use super::profiles::{write_profile_json, ProfileInfo};
use super::utils::{
    dir_size_cached, dir_size_cached_recent, format_size, profiles_folder, profiles_subdir,
    require_managed_path, CleanupTarget, Throttle,
};
use crate::{log_error, log_info};

const LEGACY_MANIFEST: &str = "installation.json";
const LEGACY_DEFAULT_SUBDIR: &str = "installations";
/// Persisted settings files of the previous app (release and dev builds).
const LEGACY_SETTINGS_FILES: [&str; 2] = ["settings.json", "settings.dev.json"];
const MIGRATION_LOG_FILE: &str = "legacy-migration.json";

#[derive(Debug, Clone, Serialize)]
pub struct LegacyInstallation {
    pub name: String,
    pub version: String,
    pub folder: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub mod_count: usize,
    pub already_migrated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LegacyMigrationSkip {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LegacyMigrationReport {
    pub migrated: usize,
    pub skipped: Vec<LegacyMigrationSkip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyMigrationEntry {
    source_folder: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LegacyMigrationLog {
    #[serde(default)]
    migrations: Vec<LegacyMigrationEntry>,
}

/// One step of an import, streamed to the UI on the run's event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MigrationProgress {
    /// `copy`, `move`, `convert` or `done`.
    pub phase: &'static str,
    /// Folder being imported (its name in the source folder).
    pub folder: String,
    /// 1-based position of the folder in this run.
    pub index: usize,
    /// How many folders this run imports.
    pub count: usize,
    /// Bytes copied for the current folder so far.
    pub bytes: u64,
    /// Known total size of the current folder, when the detection scan
    /// measured it shortly before the import.
    pub bytes_total: Option<u64>,
}

/// Progress and cancellation for one folder copy.
pub(crate) trait CopyObserver {
    /// True once the user asked the running import to stop.
    fn cancelled(&self) -> bool {
        false
    }

    /// Reports that `bytes` more content was copied.
    fn advance(&mut self, bytes: u64) {
        let _ = bytes;
    }
}

/// A copy that only answers cancellation, for importers with no progress UI.
pub(crate) struct SilentObserver;

impl CopyObserver for SilentObserver {}

pub(crate) fn cancelled_error() -> UiError {
    UiError::new("cancelled", "Import cancelled")
}

/// Streams progress for one import run and answers cancellation.
///
/// Reporting sessions emit [`MigrationProgress`] on the run's Tauri event and
/// cancel when the UI sends `<event>:cancel`; a run without an event name (or
/// without a UI) gets a silent session. Import folders can take minutes on
/// slow disks, so every copy reports which folder is being copied and how far
/// along it is — an import that "does nothing" for that long reads as hung.
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
    /// Session for a run importing `count` folders, reporting on `event`.
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

    /// The whole run is done.
    pub(crate) fn finish(&mut self) {
        self.phase = "done";
        self.emit();
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    /// Fails when the user cancelled, so the caller can stop before the next
    /// folder (or step) instead of running to completion.
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

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn migration_log_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    Ok(app_data_dir(app)?.join(MIGRATION_LOG_FILE))
}

fn read_migration_log(app: &AppHandle) -> LegacyMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &LegacyMigrationLog) -> Result<(), UiError> {
    let path = migration_log_path(app)?;
    let content = serde_json::to_string_pretty(log)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize log: {e}")))?;
    write(&path, content).map_err(|e| {
        UiError::new(
            "write_failed",
            format!("Failed to write migration log: {e}"),
        )
    })
}

/// Pure resolution of the previous app's installations folder from the raw
/// contents of its settings files (in order; later files override earlier
/// ones, so dev settings win over release settings).
fn legacy_root_from_settings(data: &Path, settings: &[String]) -> Option<PathBuf> {
    let mut parent: Option<PathBuf> = None;
    let mut subdir = LEGACY_DEFAULT_SUBDIR.to_string();
    for content in settings {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
            continue;
        };
        if let Some(value) = value.get("installationsParent").and_then(|v| v.as_str()) {
            if !value.is_empty() {
                parent = Some(PathBuf::from(value));
            }
        }
        if let Some(value) = value.get("installationsSubdir").and_then(|v| v.as_str()) {
            if !value.is_empty() {
                subdir = value.to_string();
            }
        }
    }

    let root = parent.unwrap_or_else(|| data.to_path_buf()).join(subdir);
    root.is_dir().then_some(root)
}

/// Resolves the folder that held the previous app's installations.
///
/// Reads the legacy persisted settings for a custom parent/subdir; both the
/// release and dev settings files are consulted (dev overrides release).
fn legacy_root(app: &AppHandle) -> Result<Option<PathBuf>, UiError> {
    let data = app_data_dir(app)?;
    let store = data.join("store");
    let settings: Vec<String> = LEGACY_SETTINGS_FILES
        .iter()
        .filter_map(|file| read_to_string(store.join(file)).ok())
        .collect();
    Ok(legacy_root_from_settings(&data, &settings))
}

/// Resolves the folder to scan: an explicitly chosen folder (absolute and
/// existing) or the previous app's recorded/default location.
fn scan_root(app: &AppHandle, root_override: Option<&str>) -> Result<Option<PathBuf>, UiError> {
    if let Some(root) = root_override {
        let path = PathBuf::from(root);
        if !path.is_absolute() {
            return Err(UiError::new(
                "invalid_path",
                "The folder must be an absolute path",
            ));
        }
        if !path.is_dir() {
            return Err(UiError::not_found("The selected folder does not exist"));
        }
        return Ok(Some(path));
    }
    legacy_root(app)
}

fn count_zips(dir: &Path) -> usize {
    read_dir(dir.join(MODS_DIR))
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

/// Lists installations from the previous app that can be imported.
///
/// `root` restricts the scan to an explicitly chosen folder (for custom
/// installations folders the app cannot locate by itself).
#[command]
pub async fn detect_legacy_installations(
    app: AppHandle,
    root: Option<String>,
) -> Result<Vec<LegacyInstallation>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle, root.as_deref()))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Legacy scan failed: {e}")))?
}

fn detect_blocking(
    app: &AppHandle,
    root_override: Option<&str>,
) -> Result<Vec<LegacyInstallation>, UiError> {
    let Some(root) = scan_root(app, root_override)? else {
        return Ok(Vec::new());
    };
    log_info!("legacy: scanning {}", root.display());

    let log = read_migration_log(app);
    let mut results = Vec::new();

    for entry in read_dir(&root)
        .map_err(|e| UiError::new("io_error", format!("Failed to read legacy folder: {e}")))?
    {
        let Ok(entry) = entry else { continue };
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if folder.starts_with('.') {
            continue;
        }

        let manifest = dir.join(LEGACY_MANIFEST);
        let has_manifest = manifest.is_file();
        let has_mods = dir.join(MODS_DIR).is_dir();
        if !has_manifest && !has_mods {
            continue;
        }

        let info = if has_manifest {
            read_to_string(&manifest)
                .ok()
                .and_then(|content| json5::from_str::<ProfileInfo>(&content).ok())
        } else {
            None
        };
        let name = info
            .as_ref()
            .map(|i| i.name.clone())
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| folder.clone());
        let version = info.as_ref().map(|i| i.version.clone()).unwrap_or_default();

        let already_migrated = log.migrations.iter().any(|entry| {
            entry.source_folder == folder
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });

        let size_bytes = dir_size_cached(&dir);
        results.push(LegacyInstallation {
            name,
            version,
            folder: folder.clone(),
            path: dir.to_string_lossy().to_string(),
            size_bytes,
            size_display: format_size(size_bytes),
            mod_count: count_zips(&dir),
            already_migrated,
        });
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("legacy: found {} installation(s)", results.len());
    Ok(results)
}

/// Imports legacy installations into the profiles folder.
///
/// `mode` is `"move"` (relocate, the previous folder disappears) or `"copy"`
/// (keep the previous folder usable, at the cost of extra disk space). Folder
/// name collisions import under a suffixed name (e.g. `default-2`).
///
/// `emitevent` names the Tauri event that carries [`MigrationProgress`] for the
/// run; sending `<emitevent>:cancel` stops it between files and cleans up the
/// partial folder. Folders imported before a cancel stay imported (and
/// recorded), so a retry only has to do the rest.
#[command]
pub async fn migrate_legacy_installations(
    app: AppHandle,
    folders: Vec<String>,
    mode: String,
    root: Option<String>,
    emitevent: Option<String>,
) -> Result<LegacyMigrationReport, UiError> {
    if mode != "move" && mode != "copy" {
        return Err(UiError::new(
            "invalid_mode",
            "Migration mode must be \"move\" or \"copy\"",
        ));
    }
    let mut session = ImportSession::create(&app, emitevent, folders.len());
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        migrate_blocking(&handle, folders, &mode, root.as_deref(), &mut session)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Migration failed: {e}")))?
}

fn migrate_blocking(
    app: &AppHandle,
    folders: Vec<String>,
    mode: &str,
    root_override: Option<&str>,
    session: &mut ImportSession,
) -> Result<LegacyMigrationReport, UiError> {
    let Some(old_root) = scan_root(app, root_override)? else {
        return Err(UiError::not_found(
            "No installations from the previous Story Forge were found",
        ));
    };
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    create_dir_all(&profiles_root).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create profiles folder: {e}"),
        )
    })?;

    let mut log = read_migration_log(app);
    let mut report = LegacyMigrationReport {
        migrated: 0,
        skipped: Vec::new(),
    };

    for (index, folder) in folders.iter().enumerate() {
        session.ensure_running()?;

        // The folder names come from the UI but are still untrusted input.
        if folder.is_empty()
            || folder.starts_with('.')
            || folder.contains('/')
            || folder.contains('\\')
            || folder.contains("..")
            || Path::new(folder).file_name().and_then(|n| n.to_str()) != Some(folder.as_str())
        {
            report.skipped.push(LegacyMigrationSkip {
                name: folder.clone(),
                reason: "invalid folder name".into(),
            });
            continue;
        }

        let source = old_root.join(folder);
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: folder.clone(),
                reason: "folder no longer exists".into(),
            });
            continue;
        }

        let phase = if mode == "move" { "move" } else { "copy" };
        session.begin_folder(folder, &source, index + 1, phase);
        let outcome = if mode == "move" {
            let target = free_profile_dir(&profiles_root, folder);
            require_managed_path(app, &target, "profile")?;
            move_profile_dir(&profiles_root, &source, folder, session)
        } else {
            copy_profile_dir(&profiles_root, &source, folder, session)
        };

        let target = match outcome {
            Ok(target) => target,
            Err(error) => {
                // A cancel stops the run instead of being reported as a skip.
                if session.cancelled() {
                    return Err(cancelled_error());
                }
                report.skipped.push(LegacyMigrationSkip {
                    name: folder.clone(),
                    reason: error.message,
                });
                continue;
            }
        };
        session.finish_folder();

        // Convert the manifest: the new app reads profile.json only.
        let manifest = target.join(LEGACY_MANIFEST);
        let info = if manifest.is_file() {
            match read_to_string(&manifest) {
                Ok(content) => json5::from_str::<ProfileInfo>(&content).unwrap_or_else(|e| {
                    log_error!("legacy: unreadable manifest for {}: {e}", folder);
                    ProfileInfo {
                        name: folder.clone(),
                        ..Default::default()
                    }
                }),
                Err(e) => {
                    log_error!("legacy: failed to read manifest for {}: {e}", folder);
                    ProfileInfo {
                        name: folder.clone(),
                        ..Default::default()
                    }
                }
            }
        } else {
            ProfileInfo {
                name: folder.clone(),
                ..Default::default()
            }
        };

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: folder.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }
        // The legacy manifest is no longer needed once converted.
        if manifest.is_file() {
            let _ = remove_file(&manifest);
        }

        log_info!("legacy: migrated {} ({})", info.name, mode);
        log.migrations.push(LegacyMigrationEntry {
            source_folder: folder.clone(),
            target_path: target.to_string_lossy().to_string(),
            name: info.name,
        });
        report.migrated += 1;
        // Written per folder, not once at the end: an import killed halfway
        // (force-quit, cancel, crash) must not make the folders it already
        // imported look pending again — re-importing them would duplicate the
        // data under a suffixed folder name.
        if let Err(e) = write_migration_log(app, &log) {
            log_error!("legacy: failed to record the migration log: {}", e.message);
        }
    }

    session.finish();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("storyforge-legacy-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("installations")).expect("create scratch dir");
        dir
    }

    #[test]
    fn defaults_to_the_app_data_installations_folder() {
        let data = scratch("default");
        assert_eq!(
            legacy_root_from_settings(&data, &[]),
            Some(data.join("installations"))
        );
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn honours_a_custom_parent_from_the_old_settings() {
        let data = scratch("custom");
        let parent = scratch("parent");
        let settings = format!(
            r#"{{"installationsParent":"{}","installationsSubdir":"installations"}}"#,
            parent.display()
        );
        assert_eq!(
            legacy_root_from_settings(&data, &[settings]),
            Some(parent.join("installations"))
        );
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn later_settings_override_earlier_ones() {
        let data = scratch("override");
        let parent = scratch("override-parent");
        let release = format!(r#"{{"installationsParent":"{}"}}"#, parent.display());
        let dev = r#"{"installationsSubdir":"dev-installs"}"#.to_string();
        std::fs::create_dir_all(parent.join("dev-installs")).expect("create dev dir");
        assert_eq!(
            legacy_root_from_settings(&data, &[release, dev]),
            Some(parent.join("dev-installs"))
        );
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn unresolvable_root_is_none() {
        let missing =
            std::env::temp_dir().join(format!("storyforge-legacy-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&missing);
        assert!(legacy_root_from_settings(&missing, &[]).is_none());
    }

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
        let root = scratch(name).join("profiles");
        std::fs::create_dir_all(&root).expect("create profiles folder");
        root
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
        // The source stays usable and nothing is left staged.
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
