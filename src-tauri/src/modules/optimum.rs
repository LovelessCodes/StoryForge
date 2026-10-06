//! Optimum (https://github.com/StratumServer/Optimum) integration.
//!
//! Optimum is a client-side performance fork of Vintage Story. It is not a mod
//! and it does not ship a client: releases publish a per-platform *overlay*
//! (`Optimum-v<version>-<rid>-overlay.tar.gz`) beside a machine-readable
//! manifest (`optimum-manifest-<rid>.json`) that names the archive, its
//! SHA-256, the assemblies the patch rewrites and every staged file with its
//! own hash.
//!
//! Installing means, in order: download and hash-check the archive, extract it
//! and hash-check every staged file, run the overlay's own CLI
//! (`optimum patch --game-dir <dir> --overlay <dir> --json`) against a game
//! folder, then hash-check the assemblies the CLI says it wrote.
//!
//! Story Forge versions are shared by profiles, so the patch never touches the
//! version the user picked: the base version is copied to `<version>+optimum`
//! and the copy is patched. Vanilla and Optimum then coexist as two versions
//! and a profile picks either.
//!
//! Optimum publishes overlays for Linux x86_64 and Windows x86_64 only.
//! Everywhere else the feature reports `unsupported-system` and the UI hides
//! it, exactly like RiftLauncher does.
//!
//! A loopback test origin (`STORYFORGE_OPTIMUM_ORIGIN`) exists so the whole
//! flow can be exercised without published payloads. It is honoured only for
//! `http://127.0.0.1:<port>/` with no path, nothing in a shipped build sets it,
//! and a build that finds it set logs it.

use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{command, AppHandle, Emitter, EventId, Listener, Manager, State};
use tauri_plugin_zustand::ManagerExt;
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio_util::sync::CancellationToken;
use walkdir::WalkDir;

use super::errors::UiError;
use super::utils::{lock, require_managed_path, versions_folder, versions_subdir};
use crate::{log_debug, log_error, log_info};

/// Suffix that marks a managed version as an Optimum build of its base version.
pub const OPTIMUM_SUFFIX: &str = "+optimum";

/// Folder the patch keeps its own state in, inside the game folder.
const OPTIMUM_STATE_FOLDER: &str = ".optimum";
/// Windows of the patch's own completion record.
const OPTIMUM_PATCH_MANIFEST: &str = "manifest.json";
/// Overlay marker written by the packaging script.
const OPTIMUM_VERSION_FILE: &str = "version";

/// Hard ceilings, mirroring what the overlay manifest parser in RiftLauncher
/// refuses. They exist so a hostile or corrupt document cannot make the
/// verification pass unbounded.
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_OVERLAY_FILES: usize = 10_000;
const MAX_LINE_LENGTH: usize = 64 * 1024;

/// One patch run has four targets, each its own patcher process with a
/// five-minute bound, so twenty minutes is the CLI's own worst case.
const PATCH_TIMEOUT: Duration = Duration::from_secs(20 * 60);
const SIGKILL_GRACE: Duration = Duration::from_secs(30);
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
/// Session cache for the latest manifest; the UI can force a refresh.
const MANIFEST_TTL: Duration = Duration::from_secs(30 * 60);

/// The `net10.0` channel the overlay's CLI needs. Optimum's runtimeconfig asks
/// for `Microsoft.NETCore.App 10.0.0`; the game's own channel mapping reaches
/// 10.0 from 1.22.x, and 1.22.0 is a real release, so asking for its runtime is
/// the same download the game itself would use.
const OPTIMUM_DOTNET_PROBE_VERSION: &str = "1.22.0";

// ── Version naming ──────────────────────────────────────────────────────────

/// The base game version a version name carries: `1.22.7+optimum` → `1.22.7`.
pub fn base_game_version(version: &str) -> &str {
    version.strip_suffix(OPTIMUM_SUFFIX).unwrap_or(version)
}

/// Whether a version name is an Optimum build.
pub fn is_optimum_version(version: &str) -> bool {
    version.ends_with(OPTIMUM_SUFFIX)
}

/// The name an Optimum build of `base` is registered under.
pub fn optimum_version_name(base: &str) -> String {
    format!("{base}{OPTIMUM_SUFFIX}")
}

/// The Optimum version installed in a game folder, when there is one.
///
/// The patch writes `.optimum/manifest.json` with its own record; the version
/// file is the overlay's marker, kept as a fallback for a folder whose manifest
/// did not survive.
pub(crate) fn read_optimum_version(dir: &Path) -> Option<String> {
    let manifest = dir.join(OPTIMUM_STATE_FOLDER).join(OPTIMUM_PATCH_MANIFEST);
    if let Ok(text) = fs::read_to_string(&manifest) {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if let Some(version) = value.get("optimumVersion").and_then(Value::as_str) {
                if !version.is_empty() {
                    return Some(version.to_string());
                }
            }
        }
    }
    let marker = dir.join(OPTIMUM_STATE_FOLDER).join(OPTIMUM_VERSION_FILE);
    fs::read_to_string(marker)
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

// ── Platform / origin ───────────────────────────────────────────────────────

/// The runtime identifier Optimum publishes an overlay for on this host.
///
/// macOS and every non-x64 architecture are deliberately absent: an overlay is
/// a per-platform payload, and offering one for a platform it was not built for
/// hands the player a patch that cannot run.
pub fn host_rid() -> Option<&'static str> {
    if std::env::consts::ARCH != "x86_64" {
        return None;
    }
    match std::env::consts::OS {
        "linux" => Some("linux-x64"),
        "windows" => Some("win-x64"),
        _ => None,
    }
}

/// A loopback test origin, when one was configured for development.
fn test_origin() -> Option<String> {
    let raw = std::env::var("STORYFORGE_OPTIMUM_ORIGIN").ok()?;
    match parse_loopback_origin(&raw) {
        Some(origin) => {
            log_info!("[optimum] using loopback test origin {origin}");
            Some(origin)
        }
        None => {
            log_error!("[optimum] STORYFORGE_OPTIMUM_ORIGIN is not a loopback origin; ignoring it");
            None
        }
    }
}

/// Accepts exactly `http://127.0.0.1:<port>` (trailing slash optional).
fn parse_loopback_origin(raw: &str) -> Option<String> {
    let rest = raw.strip_prefix("http://127.0.0.1:")?;
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("http://127.0.0.1:{rest}"))
}

/// The effective rid: the host's, unless a loopback test origin explicitly
/// overrides it so the flow can be exercised on a machine Optimum has no
/// payload for. The override only exists beside the test origin.
fn effective_rid() -> Option<String> {
    if test_origin().is_some() {
        if let Ok(rid) = std::env::var("STORYFORGE_OPTIMUM_RID") {
            if rid == "linux-x64" || rid == "win-x64" {
                return Some(rid);
            }
        }
    }
    host_rid().map(str::to_string)
}

fn manifest_url(rid: &str) -> String {
    match test_origin() {
        Some(origin) => format!("{origin}/optimum-manifest-{rid}.json"),
        None => format!(
            "https://github.com/StratumServer/Optimum/releases/latest/download/optimum-manifest-{rid}.json"
        ),
    }
}

fn archive_url(optimum_version: &str, filename: &str) -> String {
    match test_origin() {
        Some(origin) => format!("{origin}/{filename}"),
        None => format!(
            "https://github.com/StratumServer/Optimum/releases/download/v{optimum_version}/{filename}"
        ),
    }
}

// ── Manifest ────────────────────────────────────────────────────────────────

/// One assembly the patch rewrites, and the donor it rewrites it from.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimumTarget {
    pub assembly: String,
    pub donor: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_name: Option<String>,
}

/// One staged file, as the packaging walk recorded it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimumFile {
    pub path: String,
    pub size: u64,
    /// Bare lowercase hex; the `sha256:` prefix is stripped at parse time.
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimumArchive {
    pub filename: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimumManifest {
    pub manifest_version: u32,
    pub optimum_version: String,
    pub supported_game_versions: Vec<String>,
    pub rid: String,
    pub archive: OptimumArchive,
    pub targets: Vec<OptimumTarget>,
    pub files: Vec<OptimumFile>,
}

/// The raw wire shape, validated into [`OptimumManifest`] by [`parse_manifest`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawManifest {
    manifest_version: u32,
    optimum_version: String,
    supported_game_versions: Vec<String>,
    rid: String,
    archive: RawArchive,
    #[serde(default)]
    targets: Vec<RawTarget>,
    #[serde(default)]
    files: Vec<RawFile>,
}

#[derive(Deserialize)]
struct RawArchive {
    filename: String,
    size: u64,
    sha256: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawTarget {
    assembly: String,
    donor: String,
    mode: String,
    mod_name: Option<String>,
}

#[derive(Deserialize)]
struct RawFile {
    path: String,
    size: u64,
    sha256: String,
}

/// `sha256:` followed by 64 lowercase hex chars, the one spelling the
/// packaging script writes.
fn read_hash(value: &str) -> Option<String> {
    let hex = value.strip_prefix("sha256:")?;
    if hex.len() == 64
        && hex
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        Some(hex.to_string())
    } else {
        None
    }
}

/// True when a path is relative, forward-slashed and stays inside the folder it
/// is read against.
fn is_safe_relative_path(value: &str) -> bool {
    if value.is_empty() || value.len() > 1024 || value.contains('\0') || value.contains('\\') {
        return false;
    }
    if Path::new(value).is_absolute() {
        return false;
    }
    Path::new(value)
        .components()
        .all(|component| matches!(component, Component::Normal(segment) if !segment.is_empty()))
}

fn valid_game_versions(raw: &[String]) -> Vec<String> {
    raw.iter()
        .filter_map(|entry| semver::Version::parse(entry).ok())
        .map(|version| version.to_string())
        .collect()
}

/// Reads one overlay manifest. Anything wrong with the version, platform,
/// archive name or archive hash answers `None`: this document is the only thing
/// standing between a downloaded archive and a child process, so a bad header
/// refuses the whole document.
fn parse_manifest(text: &str) -> Option<OptimumManifest> {
    let raw: RawManifest = serde_json::from_str(text).ok()?;
    if raw.manifest_version != 1 {
        return None;
    }
    let optimum_version = semver::Version::parse(&raw.optimum_version)
        .ok()?
        .to_string();
    if raw.rid != "linux-x64" && raw.rid != "win-x64" {
        return None;
    }
    let supported_game_versions = valid_game_versions(&raw.supported_game_versions);
    if supported_game_versions.is_empty() {
        return None;
    }
    // The archive name is built from the version and platform rather than
    // matched by pattern, so this check cannot drift from the download URL.
    let expected_filename = format!("Optimum-v{optimum_version}-{}-overlay.tar.gz", raw.rid);
    if raw.archive.filename != expected_filename {
        return None;
    }
    if raw.archive.size == 0 || raw.archive.size > MAX_ARCHIVE_BYTES {
        return None;
    }
    let archive_sha256 = read_hash(&raw.archive.sha256)?;

    let targets = raw
        .targets
        .into_iter()
        .filter(|target| {
            is_safe_relative_path(&target.assembly)
                && is_safe_relative_path(&target.donor)
                && !target.mode.is_empty()
                && target.mode.len() <= 64
        })
        .map(|target| OptimumTarget {
            assembly: target.assembly,
            donor: target.donor,
            mode: target.mode,
            mod_name: target.mod_name,
        })
        .collect();

    let files: Vec<OptimumFile> = raw
        .files
        .into_iter()
        .filter(|file| is_safe_relative_path(&file.path) && file.size <= MAX_ARCHIVE_BYTES)
        .filter_map(|file| {
            let sha256 = read_hash(&file.sha256)?;
            Some(OptimumFile {
                path: file.path,
                size: file.size,
                sha256,
            })
        })
        .take(MAX_OVERLAY_FILES)
        .collect();
    // Nothing runs unless every staged file was named and hashed here, so a
    // manifest that vouches for nothing is refused.
    if files.is_empty() {
        return None;
    }

    Some(OptimumManifest {
        manifest_version: 1,
        optimum_version,
        supported_game_versions,
        rid: raw.rid,
        archive: OptimumArchive {
            filename: raw.archive.filename,
            size: raw.archive.size,
            sha256: archive_sha256,
        },
        targets,
        files,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ManifestFailure {
    UnsupportedSystem,
    NotPublished,
    Unreachable,
    Unreadable,
}

impl ManifestFailure {
    fn reason(self) -> &'static str {
        match self {
            ManifestFailure::UnsupportedSystem => "unsupported-system",
            ManifestFailure::NotPublished => "not-published",
            ManifestFailure::Unreachable => "unreachable",
            ManifestFailure::Unreadable => "unreadable",
        }
    }
}

#[derive(Clone)]
struct CachedManifest {
    manifest: OptimumManifest,
    fetched_at: Instant,
}

static MANIFEST_CACHE: OnceLock<Mutex<Option<CachedManifest>>> = OnceLock::new();

fn manifest_cache() -> &'static Mutex<Option<CachedManifest>> {
    MANIFEST_CACHE.get_or_init(|| Mutex::new(None))
}

async fn fetch_manifest(client: &reqwest::Client) -> Result<OptimumManifest, ManifestFailure> {
    let rid = effective_rid().ok_or(ManifestFailure::UnsupportedSystem)?;
    let response = client
        .get(manifest_url(&rid))
        .send()
        .await
        .map_err(|error| {
            log_error!("[optimum] manifest request failed: {error}");
            ManifestFailure::Unreachable
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND
        || response.status() == reqwest::StatusCode::GONE
    {
        return Err(ManifestFailure::NotPublished);
    }
    if !response.status().is_success() {
        log_error!("[optimum] manifest request returned {}", response.status());
        return Err(ManifestFailure::Unreachable);
    }
    if let Some(length) = response.content_length() {
        if length > MAX_MANIFEST_BYTES {
            return Err(ManifestFailure::Unreadable);
        }
    }
    let bytes = response.bytes().await.map_err(|error| {
        log_error!("[optimum] manifest read failed: {error}");
        ManifestFailure::Unreachable
    })?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(ManifestFailure::Unreadable);
    }
    let text = std::str::from_utf8(&bytes).map_err(|_| ManifestFailure::Unreadable)?;
    let manifest = parse_manifest(text).ok_or_else(|| {
        log_error!("[optimum] manifest did not survive validation");
        ManifestFailure::Unreadable
    })?;
    if manifest.rid != rid {
        return Err(ManifestFailure::UnsupportedSystem);
    }
    *lock(manifest_cache()) = Some(CachedManifest {
        manifest: manifest.clone(),
        fetched_at: Instant::now(),
    });
    Ok(manifest)
}

/// The cached manifest, or a fresh one. `refresh` forces the network read the
/// UI asks for when the install sheet opens.
async fn manifest_for_session(
    client: &reqwest::Client,
    refresh: bool,
) -> Result<OptimumManifest, ManifestFailure> {
    if !refresh {
        if let Some(cached) = lock(manifest_cache()).as_ref() {
            if cached.fetched_at.elapsed() < MANIFEST_TTL {
                return Ok(cached.manifest.clone());
            }
        }
    }
    fetch_manifest(client).await
}

// ── Status command ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimumManifestInfo {
    pub optimum_version: String,
    pub supported_game_versions: Vec<String>,
    pub rid: String,
    pub archive_size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimumStatus {
    /// This host has an Optimum overlay platform.
    pub platform_supported: bool,
    pub rid: Option<String>,
    /// `unsupported-system` | `not-published` | `unreachable` | `unreadable`,
    /// when no manifest is available.
    pub reason: Option<String>,
    pub manifest: Option<OptimumManifestInfo>,
}

#[command]
pub async fn get_optimum_status(
    client: State<'_, Arc<reqwest::Client>>,
    refresh: Option<bool>,
) -> Result<OptimumStatus, UiError> {
    log_info!("get_optimum_status: refresh={refresh:?}");
    let client: &reqwest::Client = &client;
    let rid = effective_rid();
    if rid.is_none() {
        return Ok(OptimumStatus {
            platform_supported: false,
            rid: None,
            reason: Some(ManifestFailure::UnsupportedSystem.reason().to_string()),
            manifest: None,
        });
    }
    let rid = rid.unwrap_or_default();
    match manifest_for_session(client, refresh.unwrap_or(false)).await {
        Ok(manifest) => Ok(OptimumStatus {
            platform_supported: true,
            rid: Some(rid),
            reason: None,
            manifest: Some(OptimumManifestInfo {
                optimum_version: manifest.optimum_version,
                supported_game_versions: manifest.supported_game_versions,
                rid: manifest.rid,
                archive_size: manifest.archive.size,
            }),
        }),
        Err(failure) => {
            log_info!(
                "[optimum] no usable manifest this session: {}",
                failure.reason()
            );
            Ok(OptimumStatus {
                platform_supported: true,
                rid: Some(rid),
                reason: Some(failure.reason().to_string()),
                manifest: None,
            })
        }
    }
}

// ── Hashing ─────────────────────────────────────────────────────────────────

/// Streams a file through SHA-256 so a large assembly is never held in memory.
fn sha256_file(path: &Path) -> Result<String, UiError> {
    let mut file = File::open(path)
        .map_err(|error| UiError::io(format!("Failed to open {}: {error}", path.display())))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| UiError::io(format!("Failed to read {}: {error}", path.display())))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

// ── Progress emitter ────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct OptimumProgress {
    phase: &'static str,
    progress: u8,
    message: Option<String>,
}

#[derive(Clone)]
struct OptimumEmitter {
    app: AppHandle,
    event: String,
}

impl OptimumEmitter {
    fn emit(&self, phase: &'static str, progress: u8, message: Option<String>) {
        let _ = self.app.emit(
            &self.event,
            OptimumProgress {
                phase,
                progress,
                message,
            },
        );
    }
}

fn cancelled_error() -> UiError {
    UiError::new("cancelled", "Optimum install cancelled")
}

fn is_cancelled(token: &CancellationToken) -> bool {
    token.is_cancelled()
}

// ── Download ────────────────────────────────────────────────────────────────

/// Streams `url` to `dest`, checks the length and the SHA-256, and leaves no
/// partial file behind on failure or cancellation.
async fn download_archive(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_size: u64,
    expected_sha256: &str,
    token: &CancellationToken,
    on_progress: impl Fn(u64, u64),
) -> Result<(), UiError> {
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
            "Optimum overlay archive has the wrong size",
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
            return Err(cancelled_error());
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
        if written > MAX_ARCHIVE_BYTES {
            let _ = fs::remove_file(&part);
            return Err(UiError::new(
                "download_error",
                "Optimum overlay archive is unexpectedly large",
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
            "Optimum overlay archive failed its hash check",
        ));
    }
    // Windows `rename` refuses an existing destination, and a retry after a
    // corrupted download is exactly that case.
    let _ = fs::remove_file(dest);
    fs::rename(&part, dest)
        .map_err(|error| UiError::io(format!("Failed to finalize {}: {error}", dest.display())))?;
    Ok(())
}

// ── Extraction / verification ───────────────────────────────────────────────

/// Extracts the overlay tarball into `stage`, refusing anything that is not a
/// plain file or directory, and returns the folder inside it (the archive wraps
/// everything in `Optimum-v<version>-<rid>-overlay/`).
fn extract_overlay(archive: &Path, stage: &Path) -> Result<PathBuf, UiError> {
    if stage.exists() {
        fs::remove_dir_all(stage).map_err(|error| {
            UiError::io(format!("Failed to clear {}: {error}", stage.display()))
        })?;
    }
    fs::create_dir_all(stage)
        .map_err(|error| UiError::io(format!("Failed to create {}: {error}", stage.display())))?;

    let file = File::open(archive)
        .map_err(|error| UiError::io(format!("Failed to open {}: {error}", archive.display())))?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    let entries = tar.entries().map_err(|error| {
        UiError::new("extract_error", format!("Invalid overlay archive: {error}"))
    })?;
    for entry in entries {
        let mut entry = entry.map_err(|error| {
            UiError::new("extract_error", format!("Bad archive entry: {error}"))
        })?;
        let kind = entry.header().entry_type();
        if !(kind.is_file() || kind.is_dir()) {
            return Err(UiError::new(
                "extract_error",
                "Optimum overlay holds an entry that is not a plain file or folder",
            ));
        }
        let relative = entry
            .path()
            .map_err(|error| UiError::new("extract_error", format!("Bad archive path: {error}")))?
            .into_owned();
        let Some(relative) = relative.to_str() else {
            return Err(UiError::new("extract_error", "Archive path is not UTF-8"));
        };
        if !is_safe_relative_path(relative) {
            return Err(UiError::new(
                "extract_error",
                "Optimum overlay holds a path that escapes the archive",
            ));
        }
        let target = stage.join(relative);
        if kind.is_dir() {
            fs::create_dir_all(&target).map_err(|error| {
                UiError::io(format!("Failed to create {}: {error}", target.display()))
            })?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    UiError::io(format!("Failed to create {}: {error}", parent.display()))
                })?;
            }
            entry.unpack(&target).map_err(|error| {
                UiError::io(format!("Failed to extract {}: {error}", target.display()))
            })?;
        }
    }

    // Step into the archive's single wrapping folder, the way a game build's
    // `vintagestory/` is stepped into, so callers point at the overlay root.
    let mut top_level: Vec<PathBuf> = fs::read_dir(stage)
        .map_err(|error| UiError::io(format!("Failed to read {}: {error}", stage.display())))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    if top_level.len() == 1 && top_level[0].is_dir() {
        return Ok(top_level.remove(0));
    }
    Err(UiError::new(
        "extract_error",
        "Optimum overlay archive has no wrapping folder",
    ))
}

/// Makes the CLI executable on unix; the tar crate preserves mode, but an
/// archive that lost it must not make the whole install fail.
#[cfg(unix)]
fn ensure_executable(path: &Path) -> Result<(), UiError> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| UiError::io(format!("Failed to stat {}: {error}", path.display())))?
        .permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| UiError::io(format!("Failed to chmod {}: {error}", path.display())))
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) -> Result<(), UiError> {
    Ok(())
}

fn relative_forward_slash(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts: Vec<String> = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(segment) => parts.push(segment.to_string_lossy().into_owned()),
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

/// Every file under `root`, as forward-slashed relative paths. Refuses symlinks
/// and anything that is not a plain file or folder.
fn list_staged_files(root: &Path) -> Result<Vec<String>, UiError> {
    let mut found = Vec::new();
    for entry in WalkDir::new(root).follow_links(false).min_depth(1) {
        let entry = entry.map_err(|error| {
            UiError::new("io_error", format!("Failed to walk overlay: {error}"))
        })?;
        let file_type = entry.file_type();
        if file_type.is_dir() {
            continue;
        }
        if !file_type.is_file() {
            return Err(UiError::new(
                "verify_error",
                "Staged overlay holds an entry that is not a plain file",
            ));
        }
        let Some(relative) = relative_forward_slash(root, entry.path()) else {
            return Err(UiError::new(
                "verify_error",
                "Staged overlay holds an unreadable path",
            ));
        };
        found.push(relative);
    }
    Ok(found)
}

/// The root manifest file the packaging walk cannot list because it is written
/// after the walk. Both the legacy name and the current RID-specific name are
/// accepted.
fn is_unlisted_manifest_file(path: &str, manifest: &OptimumManifest) -> bool {
    path == "optimum-manifest.json" || path == format!("optimum-manifest-{}.json", manifest.rid)
}

/// Whether the staged overlay is byte for byte the one the manifest published.
fn verify_staged_overlay(root: &Path, manifest: &OptimumManifest) -> Result<(), UiError> {
    let staged = list_staged_files(root)?;
    let listed: HashMap<&str, &OptimumFile> = manifest
        .files
        .iter()
        .map(|file| (file.path.as_str(), file))
        .collect();

    for path in &staged {
        if is_unlisted_manifest_file(path, manifest) {
            continue;
        }
        if !listed.contains_key(path.as_str()) {
            return Err(UiError::new(
                "verify_error",
                format!("Optimum overlay holds a file the manifest does not name: {path}"),
            ));
        }
    }

    for file in &manifest.files {
        let path = root.join(file.path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let metadata = fs::metadata(&path).map_err(|_| {
            UiError::new(
                "verify_error",
                format!("Optimum overlay is missing {}", file.path),
            )
        })?;
        if !metadata.is_file() || metadata.len() != file.size {
            return Err(UiError::new(
                "verify_error",
                format!("Optimum overlay file has the wrong size: {}", file.path),
            ));
        }
        if sha256_file(&path)? != file.sha256 {
            return Err(UiError::new(
                "verify_error",
                format!("Optimum overlay file failed its hash: {}", file.path),
            ));
        }
    }
    Ok(())
}

// ── Output verification ─────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PatchManifest {
    #[serde(rename = "optimumVersion")]
    optimum_version: String,
    #[serde(default)]
    targets: Vec<PatchTarget>,
}

#[derive(Deserialize)]
struct PatchTarget {
    assembly: String,
    #[serde(rename = "patchedHash")]
    patched_hash: String,
}

/// Whether the patch really wrote what it says it wrote.
///
/// Every target the overlay manifest names has to appear in
/// `<game-dir>/.optimum/manifest.json` and every hash recorded there has to
/// match the file sitting at that path now. This catches the half patch a
/// failed donor leaves behind, which still exits 0.
fn verify_patched_output(game_dir: &Path, manifest: &OptimumManifest) -> Result<(), UiError> {
    if manifest.targets.is_empty() {
        return Err(UiError::new(
            "verify_error",
            "Optimum overlay names no patched assemblies",
        ));
    }
    let state_path = game_dir
        .join(OPTIMUM_STATE_FOLDER)
        .join(OPTIMUM_PATCH_MANIFEST);
    let text = fs::read_to_string(&state_path)
        .map_err(|_| UiError::new("verify_error", "Optimum patch left no completion record"))?;
    let state: PatchManifest = serde_json::from_str(&text)
        .map_err(|_| UiError::new("verify_error", "Optimum completion record is unreadable"))?;
    if state.optimum_version != manifest.optimum_version {
        return Err(UiError::new(
            "verify_error",
            "Optimum completion record is for another version",
        ));
    }
    for target in &manifest.targets {
        let record = state
            .targets
            .iter()
            .find(|entry| entry.assembly == target.assembly)
            .ok_or_else(|| {
                UiError::new(
                    "verify_error",
                    format!("Optimum patch did not write {}", target.assembly),
                )
            })?;
        let expected = read_hash(&record.patched_hash).ok_or_else(|| {
            UiError::new("verify_error", "Optimum completion record holds a bad hash")
        })?;
        let path = game_dir.join(target.assembly.replace('/', std::path::MAIN_SEPARATOR_STR));
        let metadata = fs::metadata(&path).map_err(|_| {
            UiError::new(
                "verify_error",
                format!("Patched assembly is missing: {}", target.assembly),
            )
        })?;
        if !metadata.is_file() || sha256_file(&path)? != expected {
            return Err(UiError::new(
                "verify_error",
                format!("Patched assembly failed its hash: {}", target.assembly),
            ));
        }
    }
    Ok(())
}

// ── CLI runner ──────────────────────────────────────────────────────────────

/// The ten failure tokens the CLI itself can send.
const WIRE_REASONS: [&str; 10] = [
    "bad-input",
    "unsupported-version",
    "patch-conflict",
    "decompile-failed",
    "assemble-failed",
    "verification-failed",
    "output-exists",
    "source-unavailable",
    "cancelled",
    "engine-internal",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliResult {
    Ok,
    Failed(&'static str),
}

/// Folds the CLI's NDJSON stdout into one verdict.
///
/// The protocol is one compact JSON object per line: `progress` while it works,
/// `log` whenever it has something to say, and exactly one terminal `result`.
/// Messages and details are parsed and dropped here; what crosses is a token
/// out of a closed set and a progress number.
#[derive(Default)]
struct OptimumOutputReader {
    last_progress: u8,
    result: Option<CliResult>,
}

impl OptimumOutputReader {
    fn push_line(&mut self, line: &str) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return;
        }
        let Ok(parsed) = serde_json::from_str::<Value>(trimmed) else {
            return;
        };
        match parsed.get("type").and_then(Value::as_str) {
            Some("progress") => {
                let Some(progress) = parsed.get("progress").and_then(Value::as_f64) else {
                    return;
                };
                let clamped = progress.clamp(0.0, 99.0) as u8;
                if clamped > self.last_progress {
                    self.last_progress = clamped;
                }
            }
            Some("result") if self.result.is_none() => {
                if parsed.get("ok").and_then(Value::as_bool) == Some(true) {
                    self.result = Some(CliResult::Ok);
                } else {
                    let reason = parsed
                        .get("reason")
                        .and_then(Value::as_str)
                        .and_then(|reason| {
                            WIRE_REASONS.iter().find(|wire| **wire == reason).copied()
                        })
                        .unwrap_or("engine-internal");
                    self.result = Some(CliResult::Failed(reason));
                }
            }
            _ => {}
        }
    }

    fn finish(&mut self) -> Option<CliResult> {
        self.result
    }
}

/// The environment the child runs with, built rather than inherited: a .NET
/// apphost needs somewhere to find its runtime and somewhere to write temporary
/// files, and nothing else the launcher happens to carry.
fn child_environment(dotnet_root: &Path) -> Vec<(String, String)> {
    const FORWARDED: [&str; 10] = [
        "PATH",
        "HOME",
        "USERPROFILE",
        "SystemRoot",
        "SystemDrive",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "DOTNET_ROOT",
    ];
    let mut environment: Vec<(String, String)> = FORWARDED
        .iter()
        .filter_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| (key.to_string(), value))
        })
        .collect();
    environment.push((
        "DOTNET_ROOT".to_string(),
        dotnet_root.to_string_lossy().into_owned(),
    ));
    environment.push(("DOTNET_NOLOGO".to_string(), "1".to_string()));
    environment.push(("DOTNET_CLI_TELEMETRY_OPTOUT".to_string(), "1".to_string()));
    environment
}

fn cli_file_name() -> &'static str {
    if cfg!(windows) {
        "optimum.exe"
    } else {
        "optimum"
    }
}

/// Kills the whole run, not just the process the installer spawned: each target
/// is its own patcher process, and killing only the parent would leave
/// grandchildren rewriting assemblies inside the game folder.
#[cfg(unix)]
fn kill_run_tree(pid: u32, signal: i32) {
    // SAFETY: `kill` is called with a negative pid, which signals the process
    // group the child was given; a missing group is the outcome this wants.
    unsafe {
        libc::kill(-(pid as i32), signal);
    }
}

#[cfg(windows)]
fn kill_run_tree(pid: u32, _signal: i32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Signal numbers used by [`kill_run_tree`]; the Windows side ignores them.
const KILL_SIGTERM: i32 = 15;
const KILL_SIGKILL: i32 = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RunStop {
    Cancelled,
    TimedOut,
}

/// Turns an exit code and a folded stdout into one verdict.
fn read_run_outcome(
    exit_code: Option<i32>,
    result: Option<CliResult>,
    stop: Option<RunStop>,
) -> Result<(), &'static str> {
    match stop {
        Some(RunStop::Cancelled) => return Err("cancelled"),
        Some(RunStop::TimedOut) => return Err("timed-out"),
        None => {}
    }
    if exit_code == Some(0) {
        return match result {
            Some(CliResult::Ok) => Ok(()),
            Some(CliResult::Failed(reason)) => Err(reason),
            None => Err("no-result"),
        };
    }
    if exit_code == Some(2) {
        return Err("bad-input");
    }
    match result {
        Some(CliResult::Failed(reason)) => Err(reason),
        _ => Err("no-result"),
    }
}

/// Runs the overlay CLI once and reports what it made of the folder.
///
/// Bounded by a wall clock with a SIGKILL behind it, a cut-down environment,
/// no shell, and a progress reader that drops everything the child wrote but a
/// token. Never panics on a child that failed to spawn, hung or died.
async fn run_optimum_cli(
    cli: &Path,
    args: &[String],
    cwd: &Path,
    dotnet_root: &Path,
    token: CancellationToken,
    emitter: Option<OptimumEmitter>,
) -> Result<(), UiError> {
    let mut command = tokio::process::Command::new(cli);
    command
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in child_environment(dotnet_root) {
        command.env(key, value);
    }
    #[cfg(unix)]
    command.process_group(0);

    let mut child = command.spawn().map_err(|error| {
        log_error!("[optimum] failed to start the CLI: {error}");
        UiError::new(
            "optimum_spawn_failed",
            format!("Failed to start Optimum: {error}"),
        )
    })?;
    let pid = child.id();

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut reader = OptimumOutputReader::default();
        if let Some(stdout) = stdout {
            let mut lines = TokioBufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        if line.len() > MAX_LINE_LENGTH {
                            continue;
                        }
                        reader.push_line(&line);
                        if let Some(emitter) = &emitter {
                            let progress = 70 + (reader.last_progress * 29) / 100;
                            emitter.emit("patch", progress, None);
                        }
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
        reader.finish()
    });

    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = TokioBufReader::new(stderr).lines();
            let mut printed = 0u32;
            while let Ok(Some(line)) = lines.next_line().await {
                if printed < 200 {
                    log_debug!("[optimum] patch stderr: {line}");
                    printed += 1;
                }
            }
        }
    });

    let wait = child.wait();
    tokio::pin!(wait);
    let deadline = tokio::time::Instant::now() + PATCH_TIMEOUT;

    let mut exit_code: Option<i32> = None;
    let stop = tokio::select! {
        result = &mut wait => {
            exit_code = result.ok().and_then(|status| status.code());
            None
        }
        _ = tokio::time::sleep_until(deadline) => Some(RunStop::TimedOut),
        _ = token.cancelled() => Some(RunStop::Cancelled),
    };

    if stop.is_some() {
        if let Some(pid) = pid {
            kill_run_tree(pid, KILL_SIGTERM);
        }
        let graceful = tokio::time::timeout(SIGKILL_GRACE, &mut wait).await;
        if graceful.is_err() {
            if let Some(pid) = pid {
                kill_run_tree(pid, KILL_SIGKILL);
            }
            let _ = (&mut wait).await;
        }
    }

    let _ = stderr_task.await;
    let result = stdout_task.await.unwrap_or(None);

    match read_run_outcome(exit_code, result, stop) {
        Ok(()) => Ok(()),
        Err(reason) => Err(UiError::new("optimum_patch_failed", reason)),
    }
}

/// Whether the runtime the overlay needs is installed, asked before the patch
/// promises anything. The overlay is framework-dependent `net10.0`; a machine
/// without it gets an apphost that prints an install hint and exits non-zero.
async fn probe_cli(cli: &Path, cwd: &Path, dotnet_root: &Path) -> bool {
    let mut command = tokio::process::Command::new(cli);
    command
        .arg("--version")
        .current_dir(cwd)
        .env_clear()
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    for (key, value) in child_environment(dotnet_root) {
        command.env(key, value);
    }
    matches!(
        tokio::time::timeout(PROBE_TIMEOUT, command.status()).await,
        Ok(Ok(status)) if status.success()
    )
}

// ── Copy ────────────────────────────────────────────────────────────────────

/// Copies a game version folder so the base stays vanilla and the patch has a
/// folder of its own. Emits throttled progress; cancels between files.
fn copy_tree(
    source: &Path,
    target: &Path,
    emitter: &OptimumEmitter,
    token: &CancellationToken,
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
            return Err(cancelled_error());
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
                let percent = 50 + ((copied as f64 / total_bytes as f64) * 20.0) as u64;
                emitter.emit("copy", percent.min(70) as u8, None);
                last_emit = Instant::now();
            }
        }
    }
    Ok(())
}

/// Removes the freshly created target folder when a later step fails, so a
/// failed first install never leaves a broken version behind.
struct CleanupTarget {
    path: Option<PathBuf>,
}

impl CleanupTarget {
    fn defer(path: PathBuf) -> Self {
        Self { path: Some(path) }
    }

    fn defuse(&mut self) {
        self.path = None;
    }
}

impl Drop for CleanupTarget {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            log_info!("[optimum] removing failed install at {}", path.display());
            let _ = fs::remove_dir_all(&path);
        }
    }
}

// ── Install ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimumInstallResult {
    pub version: String,
    pub optimum_version: String,
}

struct ListenerGuard {
    app: AppHandle,
    id: EventId,
}

impl Drop for ListenerGuard {
    fn drop(&mut self) {
        self.app.unlisten(self.id);
    }
}

static INSTALL_ACTIVE: AtomicBool = AtomicBool::new(false);

struct InstallGuard;

impl Drop for InstallGuard {
    fn drop(&mut self) {
        INSTALL_ACTIVE.store(false, Ordering::SeqCst);
    }
}

/// Installs or updates Optimum for `base_version`.
///
/// The base version is copied to `<base>+optimum` (first install) and the copy
/// is patched with the newest overlay that supports the base. An existing
/// `+optimum` folder is patched in place instead, which updates it: the
/// patch's backups under `.optimum/vanilla/` make every later run converge
/// rather than compound.
#[command]
pub async fn install_optimum(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    base_version: String,
    emitevent: String,
) -> Result<OptimumInstallResult, UiError> {
    if INSTALL_ACTIVE.swap(true, Ordering::SeqCst) {
        return Err(UiError::new(
            "optimum_busy",
            "Another Optimum install is already running",
        ));
    }
    let _install_guard = InstallGuard;
    let client: &reqwest::Client = &client;

    let emitter = OptimumEmitter {
        app: app.clone(),
        event: emitevent.clone(),
    };
    let token = CancellationToken::new();
    let cancel_listener = app.listen(format!("{emitevent}:cancel"), {
        let token = token.clone();
        move |_| token.cancel()
    });
    let _listener_guard = ListenerGuard {
        app: app.clone(),
        id: cancel_listener,
    };

    log_info!("[optimum] install requested for base {base_version}");
    emitter.emit("manifest", 0, None);

    if is_optimum_version(&base_version) {
        return Err(UiError::new(
            "optimum_bad_input",
            "Optimum must be installed for a vanilla version",
        ));
    }

    let manifest = match manifest_for_session(client, false).await {
        Ok(manifest) => manifest,
        Err(failure) => {
            return Err(UiError::new(
                "optimum_manifest_unavailable",
                failure.reason(),
            ));
        }
    };
    if !manifest
        .supported_game_versions
        .iter()
        .any(|version| version == &base_version)
    {
        return Err(UiError::new(
            "optimum_unsupported_version",
            "Optimum has no build for this game version yet",
        ));
    }

    // The base may be managed or linked; the Optimum build always lands in the
    // managed versions folder so it is scanned and removable like any version.
    let base_dir = super::versions::resolve_version_dir(&app, &base_version)?;
    if !base_dir.is_dir() {
        return Err(UiError::not_found(format!(
            "Version folder not found: {}",
            base_dir.display()
        )));
    }
    if super::versions::is_incomplete(&base_dir) {
        return Err(UiError::new(
            "optimum_incomplete_version",
            "The base version is still downloading",
        ));
    }

    let app_data = app.path().app_data_dir().map_err(|error| {
        UiError::new(
            "path_error",
            format!("Failed to resolve app data dir: {error}"),
        )
    })?;
    let target_name = optimum_version_name(&base_version);
    let target_dir = versions_folder(app.clone())?
        .join(versions_subdir(app.clone()))
        .join(&target_name);
    require_managed_path(&app, &target_dir, "Versions path")?;

    let updating = target_dir.is_dir();
    let mut cleanup: Option<CleanupTarget> = None;
    if updating {
        if read_optimum_version(&target_dir).is_none() {
            return Err(UiError::new(
                "optimum_target_exists",
                format!("A folder named {target_name} already exists"),
            ));
        }
        log_info!(
            "[optimum] updating existing build at {}",
            target_dir.display()
        );
    } else {
        cleanup = Some(CleanupTarget::defer(target_dir.clone()));
    }

    // The overlay cache is verified once per version and platform; a later
    // install reuses it without touching the network for the payload.
    let overlay_dir = app_data
        .join("optimum")
        .join("overlays")
        .join(format!("{}-{}", manifest.optimum_version, manifest.rid));
    let verified_marker = overlay_dir.join(".verified");
    let overlay_ready = verified_marker.is_file()
        && fs::read_to_string(&verified_marker)
            .map(|marker| marker.trim() == manifest.archive.sha256)
            .unwrap_or(false);

    if !overlay_ready {
        let downloads_dir = app_data.join("optimum").join("downloads");
        let staging_dir = app_data
            .join("optimum")
            .join("staging")
            .join(format!("{}-{}", manifest.optimum_version, manifest.rid));
        fs::create_dir_all(&downloads_dir)
            .map_err(|error| UiError::io(format!("Failed to create overlay cache: {error}")))?;
        let archive_path = downloads_dir.join(&manifest.archive.filename);
        let archive_ok = fs::metadata(&archive_path)
            .map(|metadata| metadata.len() == manifest.archive.size)
            .unwrap_or(false)
            && sha256_file(&archive_path)
                .map(|digest| digest == manifest.archive.sha256)
                .unwrap_or(false);
        if !archive_ok {
            let url = archive_url(&manifest.optimum_version, &manifest.archive.filename);
            log_info!("[optimum] downloading {url}");
            emitter.emit("download", 5, None);
            let emitter_for_progress = emitter.clone();
            let size = manifest.archive.size;
            download_archive(
                client,
                &url,
                &archive_path,
                manifest.archive.size,
                &manifest.archive.sha256,
                &token,
                move |written, _total| {
                    let progress = 5 + ((written as f64 / size as f64) * 25.0) as u64;
                    emitter_for_progress.emit("download", progress.min(30) as u8, None);
                },
            )
            .await?;
        }

        emitter.emit("extract", 32, None);
        let staged_root = extract_overlay(&archive_path, &staging_dir)?;
        emitter.emit("verify", 40, None);
        if is_cancelled(&token) {
            return Err(cancelled_error());
        }
        verify_staged_overlay(&staged_root, &manifest)?;

        // Move the verified tree into place under its final name.
        if overlay_dir.exists() {
            fs::remove_dir_all(&overlay_dir)
                .map_err(|error| UiError::io(format!("Failed to clear overlay cache: {error}")))?;
        }
        if let Some(parent) = overlay_dir.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| UiError::io(format!("Failed to create overlay cache: {error}")))?;
        }
        fs::rename(&staged_root, &overlay_dir).map_err(|error| {
            UiError::io(format!(
                "Failed to move verified overlay into place: {error}"
            ))
        })?;
        let _ = fs::remove_dir_all(&staging_dir);
        fs::write(&verified_marker, &manifest.archive.sha256)
            .map_err(|error| UiError::io(format!("Failed to write overlay marker: {error}")))?;
    } else {
        log_info!(
            "[optimum] reusing verified overlay at {}",
            overlay_dir.display()
        );
    }

    // The overlay CLI is framework-dependent net10.0; make sure the runtime is
    // there before a patch is promised. 1.22.0 maps to the 10.0 channel and the
    // runtime is reused when the game already downloaded it.
    let use_system_dotnet = app
        .zustand()
        .get::<bool>("settings", "useSystemDotnet")
        .unwrap_or(true);
    emitter.emit("runtime", 45, None);
    let dotnet_root = super::dotnet::ensure_dotnet(
        &app,
        &app_data,
        OPTIMUM_DOTNET_PROBE_VERSION,
        0,
        use_system_dotnet,
    )
    .await?;

    let cli = overlay_dir.join(cli_file_name());
    ensure_executable(&cli)?;
    if !probe_cli(&cli, &overlay_dir, &dotnet_root).await {
        return Err(UiError::new(
            "optimum_runtime_missing",
            "The .NET runtime Optimum needs is not available",
        ));
    }
    if is_cancelled(&token) {
        return Err(cancelled_error());
    }

    if !updating {
        emitter.emit("copy", 50, None);
        log_info!(
            "[optimum] copying {} to {}",
            base_dir.display(),
            target_dir.display()
        );
        if let Err(error) = copy_tree(&base_dir, &target_dir, &emitter, &token) {
            if error.name == "cancelled" {
                emitter.emit("cancelled", 0, None);
            }
            return Err(error);
        }
    }

    emitter.emit("patch", 70, None);
    let args = vec![
        "patch".to_string(),
        "--game-dir".to_string(),
        target_dir.to_string_lossy().into_owned(),
        "--overlay".to_string(),
        overlay_dir.to_string_lossy().into_owned(),
        "--json".to_string(),
    ];
    let patch_result = run_optimum_cli(
        &cli,
        &args,
        &overlay_dir,
        &dotnet_root,
        token.clone(),
        Some(emitter.clone()),
    )
    .await;
    if let Err(error) = patch_result {
        if error.name == "cancelled" {
            emitter.emit("cancelled", 0, None);
        } else {
            log_error!("[optimum] patch failed: {}", error.message);
        }
        return Err(error);
    }

    emitter.emit("verify", 97, None);
    verify_patched_output(&target_dir, &manifest)?;

    if let Some(cleanup) = cleanup.as_mut() {
        cleanup.defuse();
    }
    emitter.emit("done", 100, None);
    log_info!(
        "[optimum] installed {} ({}) at {}",
        manifest.optimum_version,
        target_name,
        target_dir.display()
    );
    Ok(OptimumInstallResult {
        version: target_name,
        optimum_version: manifest.optimum_version,
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn manifest_json(rid: &str, files: &[(&str, &str, u64)]) -> String {
        let files: Vec<Value> = files
            .iter()
            .map(|(path, sha, size)| {
                serde_json::json!({ "path": path, "size": size, "sha256": format!("sha256:{sha}") })
            })
            .collect();
        serde_json::json!({
            "manifestVersion": 1,
            "optimumVersion": "0.3.19",
            "supportedGameVersions": ["1.22.7"],
            "rid": rid,
            "archive": {
                "filename": format!("Optimum-v0.3.19-{rid}-overlay.tar.gz"),
                "size": 1234,
                "sha256": format!("sha256:{}", "a".repeat(64)),
            },
            "targets": [
                { "assembly": "VintagestoryLib.dll", "donor": "VintagestoryLib.Donor.dll", "mode": "transplant" }
            ],
            "files": files,
        })
        .to_string()
    }

    #[test]
    fn parses_a_valid_manifest() {
        let text = manifest_json("linux-x64", &[(".optimum/version", &"b".repeat(64), 7)]);
        let manifest = parse_manifest(&text).expect("manifest should parse");
        assert_eq!(manifest.optimum_version, "0.3.19");
        assert_eq!(manifest.rid, "linux-x64");
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].sha256, "b".repeat(64));
    }

    #[test]
    fn rejects_bad_manifests() {
        // Wrong archive name for the declared version.
        let text = manifest_json("linux-x64", &[(".optimum/version", &"b".repeat(64), 7)]).replace(
            "Optimum-v0.3.19-linux-x64-overlay.tar.gz",
            "Optimum-v9.9.9-linux-x64-overlay.tar.gz",
        );
        assert!(parse_manifest(&text).is_none());

        // Uppercase hex and unprefixed hashes are not what the script writes.
        let text = manifest_json("linux-x64", &[("a", &"B".repeat(64), 1)]);
        assert!(parse_manifest(&text).is_none());
        let text = manifest_json("linux-x64", &[("a", &"b".repeat(64), 1)]).replace("sha256:", "");
        assert!(parse_manifest(&text).is_none());

        // Path traversal and absolute paths.
        let text = manifest_json("linux-x64", &[("../evil", &"b".repeat(64), 1)]);
        assert!(parse_manifest(&text).is_none());
        let text = manifest_json("linux-x64", &[("/etc/passwd", &"b".repeat(64), 1)]);
        assert!(parse_manifest(&text).is_none());
        let text = manifest_json("linux-x64", &[("a\\b", &"b".repeat(64), 1)]);
        assert!(parse_manifest(&text).is_none());

        // Empty file list vouches for nothing.
        let text = manifest_json("linux-x64", &[]);
        assert!(parse_manifest(&text).is_none());

        // Unknown platform.
        let text = manifest_json("osx-arm64", &[("a", &"b".repeat(64), 1)]);
        assert!(parse_manifest(&text).is_none());
    }

    #[test]
    fn drops_invalid_supported_versions() {
        let text = manifest_json("linux-x64", &[("a", &"b".repeat(64), 1)])
            .replace(r#"["1.22.7"]"#, r#"["1.22.7", "garbage"]"#);
        let manifest = parse_manifest(&text).expect("manifest should parse");
        assert_eq!(manifest.supported_game_versions, vec!["1.22.7"]);
    }

    #[test]
    fn version_naming_helpers() {
        assert_eq!(base_game_version("1.22.7+optimum"), "1.22.7");
        assert_eq!(base_game_version("1.22.7"), "1.22.7");
        assert!(is_optimum_version("1.22.7+optimum"));
        assert!(!is_optimum_version("1.22.7"));
        assert_eq!(optimum_version_name("1.22.7"), "1.22.7+optimum");
    }

    #[test]
    fn loopback_origin_validation() {
        assert_eq!(
            parse_loopback_origin("http://127.0.0.1:8971/"),
            Some("http://127.0.0.1:8971".to_string())
        );
        assert_eq!(
            parse_loopback_origin("http://127.0.0.1:1"),
            Some("http://127.0.0.1:1".to_string())
        );
        assert!(parse_loopback_origin("http://127.0.0.1:8971/sub").is_none());
        assert!(parse_loopback_origin("https://127.0.0.1:8971").is_none());
        assert!(parse_loopback_origin("http://example.com:80").is_none());
    }

    #[test]
    fn ndjson_reader_folds_progress_and_result() {
        let mut reader = OptimumOutputReader::default();
        reader.push_line(r#"{"type":"progress","progress":5}"#);
        assert_eq!(reader.last_progress, 5);
        reader.push_line(r#"{"type":"progress","progress":3}"#);
        assert_eq!(reader.last_progress, 5, "backwards ticks are dropped");
        reader.push_line(r#"{"type":"progress","progress":120}"#);
        assert_eq!(reader.last_progress, 99, "progress is clamped");
        reader.push_line(r#"{"type":"log","message":"hello"}"#);
        reader.push_line(r#"{"type":"result","ok":true}"#);
        assert_eq!(reader.finish(), Some(CliResult::Ok));
    }

    #[test]
    fn ndjson_reader_reads_failure_reasons() {
        let mut reader = OptimumOutputReader::default();
        reader.push_line(r#"{"type":"result","ok":false,"reason":"patch-conflict"}"#);
        assert_eq!(reader.finish(), Some(CliResult::Failed("patch-conflict")));

        let mut reader = OptimumOutputReader::default();
        reader.push_line(r#"{"type":"result","ok":false,"reason":"who knows"}"#);
        assert_eq!(reader.finish(), Some(CliResult::Failed("engine-internal")));

        let mut reader = OptimumOutputReader::default();
        reader.push_line("not json");
        assert_eq!(reader.finish(), None);
    }

    #[test]
    fn run_outcomes_follow_the_contract() {
        assert!(read_run_outcome(Some(0), Some(CliResult::Ok), None).is_ok());
        assert_eq!(
            read_run_outcome(Some(0), None, None),
            Err("no-result"),
            "exit 0 without a terminal result is not a success"
        );
        assert_eq!(
            read_run_outcome(Some(2), Some(CliResult::Ok), None),
            Err("bad-input")
        );
        assert_eq!(
            read_run_outcome(Some(1), Some(CliResult::Failed("assemble-failed")), None),
            Err("assemble-failed")
        );
        assert_eq!(
            read_run_outcome(None, Some(CliResult::Ok), Some(RunStop::TimedOut)),
            Err("timed-out")
        );
        assert_eq!(
            read_run_outcome(None, Some(CliResult::Ok), Some(RunStop::Cancelled)),
            Err("cancelled")
        );
    }

    fn write_overlay_archive(root: &Path, files: &[(&str, &[u8])]) -> PathBuf {
        let archive_path = root.join("overlay.tar.gz");
        let file = File::create(&archive_path).unwrap();
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        for (path, bytes) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(
                    &mut header,
                    format!("Optimum-v0.3.19-linux-x64-overlay/{path}"),
                    *bytes,
                )
                .unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap();
        archive_path
    }

    #[test]
    fn extracts_steps_into_wrapper_and_verifies() {
        let dir = tempfile::tempdir().unwrap();
        let body = b"hello".to_vec();
        let archive = write_overlay_archive(dir.path(), &[(".optimum/version", &body)]);
        let stage = dir.path().join("stage");
        let root = extract_overlay(&archive, &stage).unwrap();
        assert!(root.ends_with("Optimum-v0.3.19-linux-x64-overlay"));
        assert_eq!(fs::read(root.join(".optimum/version")).unwrap(), body);

        let digest = format!("{:x}", Sha256::digest(&body));
        let manifest = OptimumManifest {
            manifest_version: 1,
            optimum_version: "0.3.19".to_string(),
            supported_game_versions: vec!["1.22.7".to_string()],
            rid: "linux-x64".to_string(),
            archive: OptimumArchive {
                filename: "Optimum-v0.3.19-linux-x64-overlay.tar.gz".to_string(),
                size: 1,
                sha256: "a".repeat(64),
            },
            targets: vec![],
            files: vec![OptimumFile {
                path: ".optimum/version".to_string(),
                size: body.len() as u64,
                sha256: digest.clone(),
            }],
        };
        assert!(verify_staged_overlay(&root, &manifest).is_ok());

        // The root manifest is allowed unlisted.
        let mut f = File::create(root.join("optimum-manifest.json")).unwrap();
        f.write_all(b"{}").unwrap();
        assert!(verify_staged_overlay(&root, &manifest).is_ok());

        // Anything else unlisted fails.
        fs::write(root.join("extra.dll"), b"x").unwrap();
        assert!(verify_staged_overlay(&root, &manifest).is_err());
        fs::remove_file(root.join("extra.dll")).unwrap();

        // A tampered file fails.
        fs::write(root.join(".optimum/version"), b"tampered").unwrap();
        assert!(verify_staged_overlay(&root, &manifest).is_err());
    }

    #[test]
    fn rejects_unsafe_relative_paths() {
        assert!(is_safe_relative_path("a/b"));
        assert!(is_safe_relative_path(".optimum/version"));
        assert!(!is_safe_relative_path("../evil"));
        assert!(!is_safe_relative_path("a/../../evil"));
        assert!(!is_safe_relative_path("/etc/passwd"));
        assert!(!is_safe_relative_path("a\\b"));
        assert!(!is_safe_relative_path(""));
        // A leading `./` is kept as a `CurDir` component and refused; an
        // interior `.` is normalized away and resolves inside the folder.
        assert!(!is_safe_relative_path("./a"));
        assert!(is_safe_relative_path("a/./b"));
    }

    #[test]
    fn rejects_archives_with_unsafe_paths() {
        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join("unsafe.tar.gz");
        let file = File::create(&archive_path).unwrap();
        let encoder = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(1);
        header.set_mode(0o644);
        header.set_cksum();
        // A backslash is a legal filename character on unix, and the packaging
        // format never produces one; the extractor refuses it.
        builder
            .append_data(&mut header, "optimum/a\\b", &b"x"[..])
            .unwrap();
        builder.into_inner().unwrap().finish().unwrap();

        let stage = dir.path().join("stage");
        assert!(extract_overlay(&archive_path, &stage).is_err());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn runs_a_fake_cli_and_folds_its_output() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let cli = dir.path().join("optimum");
        fs::write(
            &cli,
            "#!/bin/sh\necho '{\"type\":\"progress\",\"progress\":10}'\necho '{\"type\":\"result\",\"ok\":true}'\nexit 0\n",
        )
        .unwrap();
        let mut permissions = fs::metadata(&cli).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&cli, permissions).unwrap();

        let result = run_optimum_cli(
            &cli,
            &[],
            dir.path(),
            dir.path(),
            CancellationToken::new(),
            None,
        )
        .await;
        assert!(result.is_ok(), "fake CLI should succeed: {result:?}");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fake_cli_without_result_fails() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let cli = dir.path().join("optimum");
        fs::write(&cli, "#!/bin/sh\nexit 0\n").unwrap();
        let mut permissions = fs::metadata(&cli).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&cli, permissions).unwrap();

        let result = run_optimum_cli(
            &cli,
            &[],
            dir.path(),
            dir.path(),
            CancellationToken::new(),
            None,
        )
        .await;
        assert_eq!(
            result.unwrap_err().message,
            "no-result",
            "exit 0 without a terminal result must fail"
        );
    }

    /// Exercises the real published overlay end to end: manifest parse,
    /// archive download and hash check, extraction, and per-file verification.
    /// Network-dependent, so ignored by default; run with
    /// `cargo test optimum::tests::real -- --ignored`.
    #[tokio::test]
    #[ignore = "network"]
    async fn real_overlay_downloads_extracts_and_verifies() {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .user_agent("StoryForge/test")
            .build()
            .unwrap();
        let rid = "linux-x64";
        let manifest_text = client
            .get(format!(
                "https://github.com/StratumServer/Optimum/releases/latest/download/optimum-manifest-{rid}.json"
            ))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        let manifest = parse_manifest(&manifest_text).expect("real manifest should parse");
        assert_eq!(manifest.rid, rid);
        assert!(!manifest.files.is_empty());

        let dir = tempfile::tempdir().unwrap();
        let archive_path = dir.path().join(&manifest.archive.filename);
        download_archive(
            &client,
            &archive_url(&manifest.optimum_version, &manifest.archive.filename),
            &archive_path,
            manifest.archive.size,
            &manifest.archive.sha256,
            &CancellationToken::new(),
            |_, _| {},
        )
        .await
        .expect("archive should download and hash-check");

        let stage = dir.path().join("staging");
        let root = extract_overlay(&archive_path, &stage).expect("overlay should extract");
        verify_staged_overlay(&root, &manifest).expect("every staged file should verify");
    }
}
