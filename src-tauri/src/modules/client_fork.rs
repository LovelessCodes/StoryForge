//! Machinery the alternate-client forks (Optimum, VulkanStory) share.
//!
//! Both features install a client-side fork of Vintage Story the same way:
//! the managed game version the user picked is copied to a sibling
//! `<version>+<fork>` folder and the fork's payload goes into the copy, so
//! vanilla and the fork coexist as two versions and a profile picks either.
//! The payloads differ — Optimum patches a tarball overlay into the copy,
//! VulkanStory extracts a ZIP package — so extraction, payload verification
//! and the per-fork install records stay in [`super::optimum`] and
//! [`super::vulkanstory`]. What is the same operation for both lives here: the
//! platform and loopback test-origin checks, the manifest session cache, the
//! progress emitter, the archive download, the base-folder copy and the
//! install guards.
//!
//! Nothing here decides what a caller reports: the phase strings, progress
//! bands, byte ceilings and messages that name the product are arguments, so
//! each module keeps emitting exactly the values it did before this module
//! existed.

use std::{
    fs::{self, File},
    future::Future,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, EventId, Listener, Manager};
use tokio_util::sync::CancellationToken;
use walkdir::WalkDir;

use super::errors::UiError;
use super::utils::{lock, parse_loopback_origin, sha256_file, CleanupTarget};
use crate::{log_error, log_info};

/// Hard ceiling both forks' manifest documents are held to. It exists so a
/// hostile or corrupt document cannot make a read unbounded. The archive
/// ceilings differ per fork and stay with the modules.
pub const MAX_MANIFEST_BYTES: u64 = 256 * 1024;

/// Session cache for the latest manifest; the UI can force a refresh.
pub const MANIFEST_TTL: Duration = Duration::from_secs(30 * 60);

// ── Manifest failures ───────────────────────────────────────────────────────

/// Why no manifest is available; [`ManifestFailure::reason`] is the token the
/// status command reports and the UI understands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestFailure {
    UnsupportedSystem,
    NotPublished,
    Unreachable,
    Unreadable,
}

impl ManifestFailure {
    pub fn reason(self) -> &'static str {
        match self {
            ManifestFailure::UnsupportedSystem => "unsupported-system",
            ManifestFailure::NotPublished => "not-published",
            ManifestFailure::Unreachable => "unreachable",
            ManifestFailure::Unreadable => "unreadable",
        }
    }
}

// ── Manifest cache ──────────────────────────────────────────────────────────

/// One validated manifest plus when it was read.
#[derive(Clone)]
pub struct CachedManifest<M> {
    pub manifest: M,
    pub fetched_at: Instant,
}

/// The cached manifest, or a fresh one from `fetch`. `refresh` forces the
/// network read the UI asks for when the install sheet opens.
///
/// `cache_fresh` records what `fetch` answered in `cache`. Optimum caches
/// inside its own fetch and passes `false`; VulkanStory caches here and passes
/// `true`, which is where each module cached before this helper existed.
pub async fn manifest_for_session<M: Clone>(
    cache: &'static Mutex<Option<CachedManifest<M>>>,
    refresh: bool,
    cache_fresh: bool,
    fetch: impl Future<Output = Result<M, ManifestFailure>>,
) -> Result<M, ManifestFailure> {
    if !refresh {
        if let Some(cached) = lock(cache).as_ref() {
            if cached.fetched_at.elapsed() < MANIFEST_TTL {
                return Ok(cached.manifest.clone());
            }
        }
    }
    let manifest = fetch.await?;
    if cache_fresh {
        *lock(cache) = Some(CachedManifest {
            manifest: manifest.clone(),
            fetched_at: Instant::now(),
        });
    }
    Ok(manifest)
}

// ── Platform / origin ───────────────────────────────────────────────────────

/// Where one fork's payloads live, how it names itself and how its loopback
/// test hook works.
///
/// The forks publish different RID sets and read their test hook from their
/// own environment variables, so those are configuration rather than shared
/// constants; everything else about resolving a platform is identical.
pub struct ForkPlatform {
    /// Log tag, e.g. `optimum`.
    pub tag: &'static str,
    /// Display name, e.g. `Optimum`, used in user-visible messages.
    pub display: &'static str,
    /// Environment variable that may carry a loopback test origin.
    pub origin_var: &'static str,
    /// Environment variable that may override the host RID; honoured only
    /// while a test origin is set.
    pub rid_var: &'static str,
    /// The RIDs a fork publishes a payload for on this host, by OS. macOS and
    /// every non-x64 architecture are deliberately absent: offering a payload
    /// for a platform it was not built for hands the player something that
    /// cannot run.
    pub host_rids: &'static [(&'static str, &'static str)],
    /// The RIDs a test override may name.
    pub test_rids: &'static [&'static str],
}

impl ForkPlatform {
    /// The runtime identifier this fork publishes a payload for on this host.
    pub fn host_rid(&self) -> Option<&'static str> {
        if std::env::consts::ARCH != "x86_64" {
            return None;
        }
        self.host_rids
            .iter()
            .find(|(os, _)| *os == std::env::consts::OS)
            .map(|(_, rid)| *rid)
    }

    /// A loopback test origin, when one was configured for development.
    pub fn test_origin(&self) -> Option<String> {
        let raw = std::env::var(self.origin_var).ok()?;
        match parse_loopback_origin(&raw) {
            Some(origin) => {
                log_info!("[{}] using loopback test origin {origin}", self.tag);
                Some(origin)
            }
            None => {
                log_error!(
                    "[{}] {} is not a loopback origin; ignoring it",
                    self.tag,
                    self.origin_var
                );
                None
            }
        }
    }

    /// The effective rid: the host's, unless a loopback test origin explicitly
    /// overrides it so the flow can be exercised on a machine the fork has no
    /// payload for. The override only exists beside the test origin.
    pub fn effective_rid(&self) -> Option<String> {
        if self.test_origin().is_some() {
            if let Ok(rid) = std::env::var(self.rid_var) {
                if self.test_rids.contains(&rid.as_str()) {
                    return Some(rid);
                }
            }
        }
        self.host_rid().map(str::to_string)
    }
}

// ── Status ──────────────────────────────────────────────────────────────────

/// One fork's status, as the frontend reads it. The fork's own manifest-info
/// type is the type parameter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForkStatus<M> {
    /// This host has a payload platform for the fork.
    pub platform_supported: bool,
    pub rid: Option<String>,
    /// `unsupported-system` | `not-published` | `unreachable` | `unreadable`,
    /// when no manifest is available.
    pub reason: Option<String>,
    pub manifest: Option<M>,
}

// ── Progress emitter ────────────────────────────────────────────────────────

/// Progress payload sent to the frontend.
#[derive(Clone, Serialize)]
pub struct ForkProgress {
    pub phase: &'static str,
    pub progress: u8,
    pub message: Option<String>,
}

/// Emits [`ForkProgress`] on the event one install run was given.
#[derive(Clone)]
pub struct ForkEmitter {
    app: AppHandle,
    event: String,
}

impl ForkEmitter {
    /// Sends one progress update; a closed event channel is not an error.
    pub fn emit(&self, phase: &'static str, progress: u8, message: Option<String>) {
        let _ = self.app.emit(
            &self.event,
            ForkProgress {
                phase,
                progress,
                message,
            },
        );
    }
}

/// The emitter, cancellation token and cancel listener one install run uses.
///
/// Progress goes out on `emitevent`; `<emitevent>:cancel` cancels the token.
/// The returned listener guard unlistens when the run ends, however it ends.
pub fn install_cancellation(
    app: &AppHandle,
    emitevent: &str,
) -> (ForkEmitter, CancellationToken, ListenerGuard) {
    let emitter = ForkEmitter {
        app: app.clone(),
        event: emitevent.to_string(),
    };
    let token = CancellationToken::new();
    let cancel_listener = app.listen(format!("{emitevent}:cancel"), {
        let token = token.clone();
        move |_| token.cancel()
    });
    let listener_guard = ListenerGuard {
        app: app.clone(),
        id: cancel_listener,
    };
    (emitter, token, listener_guard)
}

// ── Install guards ──────────────────────────────────────────────────────────

/// Unlistens the cancel event when an install ends, however it ends.
pub struct ListenerGuard {
    app: AppHandle,
    id: EventId,
}

impl Drop for ListenerGuard {
    fn drop(&mut self) {
        self.app.unlisten(self.id);
    }
}

/// Releases one fork's install slot when a run ends, however it ends.
///
/// Each module keeps its own `INSTALL_ACTIVE` static, so installing one client
/// never blocks the other; the guard only borrows the static it guards.
pub struct InstallGuard {
    active: &'static AtomicBool,
}

impl InstallGuard {
    /// Takes the install slot, or answers `None` when another install of the
    /// same fork is already running.
    pub fn acquire(active: &'static AtomicBool) -> Option<Self> {
        if active.swap(true, Ordering::SeqCst) {
            None
        } else {
            Some(Self { active })
        }
    }
}

impl Drop for InstallGuard {
    fn drop(&mut self) {
        self.active.store(false, Ordering::SeqCst);
    }
}

/// Whether the install was cancelled.
pub fn is_cancelled(token: &CancellationToken) -> bool {
    token.is_cancelled()
}

/// The error a cancelled install of `product` reports.
pub fn cancelled_error(product: &str) -> UiError {
    UiError::new("cancelled", format!("{product} install cancelled"))
}

// ── Download ────────────────────────────────────────────────────────────────

/// One archive to fetch: where it comes from, where it lands, and what the
/// payload has to hash to.
pub struct ArchiveDownload<'a> {
    /// The URL to stream.
    pub url: &'a str,
    /// Where the verified archive lands; a `.part` file is written beside it.
    pub dest: &'a Path,
    /// The manifest's declared length.
    pub expected_size: u64,
    /// The manifest's declared SHA-256, lowercase hex.
    pub expected_sha256: &'a str,
    /// This fork's own ceiling for the payload.
    pub max_bytes: u64,
    /// The fork's display name, e.g. `Optimum`, for error messages.
    pub product: &'a str,
    /// What the payload is called in error messages, e.g. `overlay archive`.
    pub archive: &'a str,
}

/// Streams `download.url` to `download.dest`, checks the length and the
/// SHA-256, and leaves no partial file behind on failure or cancellation.
pub async fn download_archive(
    client: &reqwest::Client,
    download: &ArchiveDownload<'_>,
    token: &CancellationToken,
    on_progress: impl Fn(u64, u64),
) -> Result<(), UiError> {
    let ArchiveDownload {
        url,
        dest,
        expected_size,
        expected_sha256,
        max_bytes,
        product,
        archive,
    } = *download;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| UiError::new("request_error", format!("Request error: {error}")))?;
    if !response.status().is_success() {
        return Err(UiError::new(
            "http_error",
            format!("HTTP error: {}", response.status()),
        ));
    }
    let total = response.content_length().unwrap_or(expected_size).max(1);
    if response
        .content_length()
        .is_some_and(|length| length != expected_size)
    {
        return Err(UiError::new(
            "download_error",
            format!("{product} {archive} has the wrong size"),
        ));
    }

    let part = dest.with_extension("part");
    let mut file = File::create(&part)
        .map_err(|error| UiError::io(format!("Failed to create {}: {error}", part.display())))?;
    let mut hasher = Sha256::new();
    let mut written = 0u64;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if is_cancelled(token) {
            drop(file);
            let _ = fs::remove_file(&part);
            return Err(cancelled_error(product));
        }
        let chunk = chunk.map_err(|error| {
            let _ = fs::remove_file(&part);
            UiError::new("request_error", format!("Read error: {error}"))
        })?;
        file.write_all(&chunk).map_err(|error| {
            let _ = fs::remove_file(&part);
            UiError::io(format!("Failed to write {}: {error}", part.display()))
        })?;
        hasher.update(&chunk);
        written += chunk.len() as u64;
        if written > max_bytes {
            let _ = fs::remove_file(&part);
            return Err(UiError::new(
                "download_error",
                format!("{product} {archive} is unexpectedly large"),
            ));
        }
        on_progress(written, total);
    }
    drop(file);

    let digest = format!("{:x}", hasher.finalize());
    if written != expected_size || digest != expected_sha256 {
        let _ = fs::remove_file(&part);
        return Err(UiError::new(
            "download_error",
            format!("{product} {archive} failed its hash check"),
        ));
    }
    // Windows `rename` refuses an existing destination, and a retry after a
    // corrupted download is exactly that case.
    let _ = fs::remove_file(dest);
    fs::rename(&part, dest)
        .map_err(|error| UiError::io(format!("Failed to finalize {}: {error}", dest.display())))?;
    Ok(())
}

/// Whether a cached archive is the one the manifest named: same length, same
/// SHA-256.
pub fn cached_archive_is_valid(path: &Path, size: u64, sha256: &str) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.len() == size)
        .unwrap_or(false)
        && sha256_file(path)
            .map(|digest| digest == sha256)
            .unwrap_or(false)
}

// ── Copy ────────────────────────────────────────────────────────────────────

/// Copies a game version folder so the base stays vanilla and the fork has a
/// folder of its own. Emits throttled progress within `band`; cancels between
/// files.
fn copy_tree(
    source: &Path,
    target: &Path,
    emitter: Option<&ForkEmitter>,
    token: &CancellationToken,
    band: (u8, u8),
    platform: &ForkPlatform,
) -> Result<(), UiError> {
    let mut total_bytes = 0u64;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry = entry
            .map_err(|error| UiError::io(format!("Failed to walk version folder: {error}")))?;
        if entry.file_type().is_file() || entry.path().is_file() {
            total_bytes += fs::metadata(entry.path()).map(|m| m.len()).unwrap_or(0);
        }
    }
    let total_bytes = total_bytes.max(1);

    fs::create_dir_all(target)
        .map_err(|error| UiError::io(format!("Failed to create {}: {error}", target.display())))?;

    let mut copied = 0u64;
    let mut last_emit = Instant::now();
    for entry in WalkDir::new(source).follow_links(false).min_depth(1) {
        if is_cancelled(token) {
            return Err(cancelled_error(platform.display));
        }
        let entry = entry
            .map_err(|error| UiError::io(format!("Failed to walk version folder: {error}")))?;
        let destination = target.join(
            entry
                .path()
                .strip_prefix(source)
                .map_err(|_| UiError::io("Failed to map version folder path"))?,
        );
        if entry.file_type().is_dir() || entry.path().is_dir() {
            fs::create_dir_all(&destination).map_err(|error| {
                UiError::io(format!(
                    "Failed to create {}: {error}",
                    destination.display()
                ))
            })?;
            continue;
        }
        if entry.file_type().is_file() || entry.path().is_file() {
            // A symlinked file is copied as its target, the same way the base
            // install behaves when launched.
            fs::copy(entry.path(), &destination).map_err(|error| {
                UiError::io(format!(
                    "Failed to copy {} to {}: {error}",
                    entry.path().display(),
                    destination.display()
                ))
            })?;
            copied += entry.metadata().map(|m| m.len()).unwrap_or(0);
            if last_emit.elapsed() >= Duration::from_millis(100) {
                let percent = band.0 as u64
                    + ((copied as f64 / total_bytes as f64) * (band.1 - band.0) as f64) as u64;
                if let Some(emitter) = emitter {
                    emitter.emit("copy", percent.min(band.1 as u64) as u8, None);
                }
                last_emit = Instant::now();
            }
        }
    }
    Ok(())
}

/// Copies the vanilla base into the fork's own folder on a first install.
///
/// Emits the `copy` phase at `band.0` and throttled progress up to `band.1`,
/// and maps a cancellation to the `cancelled` phase. An update (`updating`
/// set) leaves the base alone and copies nothing.
pub fn copy_base(
    updating: bool,
    base_dir: &Path,
    target_dir: &Path,
    emitter: &ForkEmitter,
    token: &CancellationToken,
    band: (u8, u8),
    platform: &ForkPlatform,
) -> Result<(), UiError> {
    if updating {
        return Ok(());
    }
    emitter.emit("copy", band.0, None);
    log_info!(
        "[{}] copying {} to {}",
        platform.tag,
        base_dir.display(),
        target_dir.display()
    );
    if let Err(error) = copy_tree(base_dir, target_dir, Some(emitter), token, band, platform) {
        if error.name == "cancelled" {
            emitter.emit("cancelled", 0, None);
        }
        return Err(error);
    }
    Ok(())
}

// ── Install helpers ─────────────────────────────────────────────────────────

/// The non-empty string under `key` in `<dir>/<folder>/<record>`, when the
/// file exists and is a JSON object.
pub fn read_version_from_record(
    dir: &Path,
    folder: &str,
    record: &str,
    key: &str,
) -> Option<String> {
    let path = dir.join(folder).join(record);
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .filter(|version| !version.is_empty())
        .map(str::to_string)
}

/// The app's data directory, as every fork install resolves it.
pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path().app_data_dir().map_err(|error| {
        UiError::new(
            "path_error",
            format!("Failed to resolve app data dir: {error}"),
        )
    })
}

/// Resolves the base version's folder, refusing a missing or still-downloading
/// one. `incomplete_error` is the module's own error name for a base that is
/// still downloading.
pub fn require_ready_base(
    app: &AppHandle,
    base_version: &str,
    incomplete_error: &'static str,
) -> Result<PathBuf, UiError> {
    let base_dir = super::versions::resolve_version_dir(app, base_version)?;
    if !base_dir.is_dir() {
        return Err(UiError::not_found(format!(
            "Version folder not found: {}",
            base_dir.display()
        )));
    }
    if super::versions::is_incomplete(&base_dir) {
        return Err(UiError::new(
            incomplete_error,
            "The base version is still downloading",
        ));
    }
    Ok(base_dir)
}

/// Defuses the broken-install cleanup, announces the `done` phase and logs the
/// finished install.
pub fn finish_install(
    cleanup: &mut Option<CleanupTarget>,
    emitter: &ForkEmitter,
    platform: &ForkPlatform,
    version: &str,
    target_name: &str,
    target_dir: &Path,
) {
    if let Some(cleanup) = cleanup.as_mut() {
        cleanup.defuse();
    }
    emitter.emit("done", 100, None);
    log_info!(
        "[{}] installed {version} ({target_name}) at {}",
        platform.tag,
        target_dir.display()
    );
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn manifest_failure_reasons_are_the_wire_tokens() {
        assert_eq!(
            ManifestFailure::UnsupportedSystem.reason(),
            "unsupported-system"
        );
        assert_eq!(ManifestFailure::NotPublished.reason(), "not-published");
        assert_eq!(ManifestFailure::Unreachable.reason(), "unreachable");
        assert_eq!(ManifestFailure::Unreadable.reason(), "unreadable");
    }

    #[test]
    fn cached_archive_validation_checks_size_and_hash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("archive.bin");
        fs::write(&path, b"payload").unwrap();
        let digest = format!("{:x}", Sha256::digest(b"payload"));
        assert!(cached_archive_is_valid(&path, 7, &digest));
        assert!(!cached_archive_is_valid(&path, 8, &digest));
        assert!(!cached_archive_is_valid(&path, 7, &"a".repeat(64)));
        assert!(!cached_archive_is_valid(
            &dir.path().join("missing.bin"),
            7,
            &digest
        ));
    }

    #[test]
    fn version_records_read_the_named_key() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".fork")).unwrap();
        fs::write(
            dir.path().join(".fork/record.json"),
            r#"{"forkVersion":"1.2.3"}"#,
        )
        .unwrap();
        assert_eq!(
            read_version_from_record(dir.path(), ".fork", "record.json", "forkVersion"),
            Some("1.2.3".to_string())
        );
        assert_eq!(
            read_version_from_record(dir.path(), ".fork", "record.json", "other"),
            None
        );
        assert_eq!(
            read_version_from_record(dir.path(), ".fork", "missing.json", "forkVersion"),
            None
        );
        // An empty value is not a version.
        fs::write(
            dir.path().join(".fork/record.json"),
            r#"{"forkVersion":""}"#,
        )
        .unwrap();
        assert_eq!(
            read_version_from_record(dir.path(), ".fork", "record.json", "forkVersion"),
            None
        );
    }
}
