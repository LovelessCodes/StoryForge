//! VulkanStory (https://github.com/KillerPixelCrew/VulkanStory) integration.
//!
//! VulkanStory is a client-side renderer fork of Vintage Story: a Vulkan 1.3
//! renderer with TAA, DLSS/FSR/XeSS upscaling and frame generation, delivered
//! as a package that sits beside the game executable. It is not patched into
//! the game assemblies; installing means extracting the release package into
//! the game folder, which adds `hostfxr.dll`, `VulkanStory/` and two `Mods/`
//! entries and leaves every official game file untouched.
//!
//! Releases publish a per-platform package (`VulkanStory-<rid>.zip`) beside
//! `archives.json`, which lists every archive with its SHA-256. The archive
//! embeds `VulkanStory/package.json`: a complete inventory of the packaged
//! files with per-file SHA-256 hashes, plus the one game profile
//! (`vs-<game>-<rid>`) the package was built for. The launcher reads that
//! inventory from the *remote* archive over HTTP range requests — the end of
//! the central directory is a few kilobytes even for the 148 MB package — so
//! the supported game version and the expected payload hashes are known
//! before anything is downloaded, and every extracted file is re-verified
//! against them afterwards.
//!
//! Story Forge versions are shared by profiles, so the package is never
//! extracted over the version the user picked: the base version is copied to
//! `<version>+vulkanstory` and the package goes into the copy. Vanilla and
//! VulkanStory then coexist as two versions and a profile picks either.
//! Updates extract the new package over the copy; an edited
//! `VulkanStory/loader.ini` (the documented `Enabled=0` switch) survives,
//! matching the ownership-aware updater that ships inside the package.
//!
//! VulkanStory publishes Windows x86_64 packages only. The Linux package is a
//! development package whose installer rewrites `run.sh`, so this module
//! deliberately reports `unsupported-system` everywhere else; a Linux flow
//! would need the startup-hook installation, not an extraction.
//!
//! A loopback test origin (`STORYFORGE_VULKANSTORY_ORIGIN`) exists so the whole
//! flow can be exercised without published payloads. It is honoured only for
//! `http://127.0.0.1:<port>/` with no path, nothing in a shipped build sets it,
//! and a build that finds it set logs it.

use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Read,
    path::Path,
    sync::{atomic::AtomicBool, Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{command, AppHandle, State};
use tokio_util::sync::CancellationToken;

use super::client_fork::{
    self, app_data_dir, cached_archive_is_valid, copy_base, download_archive, finish_install,
    install_cancellation, is_cancelled, read_version_from_record, require_ready_base,
    ArchiveDownload, CachedManifest, ForkEmitter, ForkPlatform, ForkProgress, ForkStatus,
    InstallGuard, ManifestFailure, MAX_MANIFEST_BYTES,
};
use super::errors::UiError;
use super::utils::{
    hex_lower, is_safe_relative_path, require_managed_path, sha256_file, versions_folder,
    versions_subdir, CleanupTarget,
};
use super::versions::VULKANSTORY_SUFFIX;
use crate::{log_error, log_info};

/// Folder this integration keeps its own state in, inside the game folder.
const VULKANSTORY_STATE_FOLDER: &str = ".vulkanstory";
/// Its record of what was installed and from which release.
const VULKANSTORY_INSTALL_RECORD: &str = "install.json";
/// The package inventory inside the release archive.
const PACKAGE_JSON_PATH: &str = "VulkanStory/package.json";
/// The user-editable loader configuration, preserved across updates.
const LOADER_INI_PATH: &str = "VulkanStory/loader.ini";

const REPOSITORY: &str = "https://github.com/KillerPixelCrew/VulkanStory";
const TEST_ORIGIN_VAR: &str = "STORYFORGE_VULKANSTORY_ORIGIN";
const TEST_RID_VAR: &str = "STORYFORGE_VULKANSTORY_RID";

/// Runtime identifiers the packaging scripts know. Parsing accepts both so a
/// foreign package is reported as foreign rather than as unreadable; only
/// [`host_rid`] decides what this launcher can actually install.
const KNOWN_RIDS: [&str; 2] = ["win-x64", "linux-x64"];

/// Hard ceilings, mirroring the bounds the upstream installers enforce. They
/// exist so a hostile or corrupt document cannot make a pass unbounded. The
/// manifest ceiling itself is shared by both client forks
/// ([`client_fork::MAX_MANIFEST_BYTES`]).
const MAX_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES: u64 = 16 * 1024 * 1024;
const MAX_PACKAGE_FILES: usize = 10_000;
/// A ZIP end record plus its optional comment always fits in 64 KiB; the
/// window is doubled so a writer that emits both a zip64 locator and a long
/// comment still falls inside it.
const EOCD_WINDOW: u64 = 128 * 1024;

// ── Version naming ──────────────────────────────────────────────────────────

pub fn is_vulkanstory_version(version: &str) -> bool {
    version.ends_with(VULKANSTORY_SUFFIX)
}

pub fn vulkanstory_version_name(base: &str) -> String {
    format!("{base}{VULKANSTORY_SUFFIX}")
}

/// What an install wrote down about itself.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallRecord {
    schema: u32,
    vulkanstory_version: String,
    base_game_version: String,
    rid: String,
    archive_filename: String,
    archive_sha256: String,
}

/// The VulkanStory version installed in a game folder, when there is one.
///
/// Read from the launcher's own install record; a folder that only carries the
/// upstream ZIP (or the in-game installer mod) has no record and is treated as
/// foreign, the same way an `+optimum` folder without the patch's completion
/// record is.
pub(crate) fn read_vulkanstory_version(dir: &Path) -> Option<String> {
    read_version_from_record(
        dir,
        VULKANSTORY_STATE_FOLDER,
        VULKANSTORY_INSTALL_RECORD,
        "vulkanstoryVersion",
    )
}

// ── Platform / origin ───────────────────────────────────────────────────────

/// VulkanStory's platform and loopback test-hook configuration.
const PLATFORM: ForkPlatform = ForkPlatform {
    tag: "vulkanstory",
    display: "VulkanStory",
    origin_var: TEST_ORIGIN_VAR,
    rid_var: TEST_RID_VAR,
    host_rids: &[("windows", "win-x64")],
    test_rids: &["win-x64"],
};

/// The runtime identifier VulkanStory publishes a package for on this host.
///
/// Only the Windows x86_64 package is published; the Linux package in
/// VulkanStory's tree is a development package that inserts a startup hook
/// into `run.sh`, which is a different operation than extracting a copy, and
/// macOS and every non-x64 architecture have no package at all. Offering one
/// anyway would hand the player a payload that cannot run.
pub fn host_rid() -> Option<&'static str> {
    PLATFORM.host_rid()
}

/// A loopback test origin, when one was configured for development.
fn test_origin() -> Option<String> {
    PLATFORM.test_origin()
}

/// The effective rid: the host's, unless a loopback test origin explicitly
/// overrides it so the flow can be exercised on a machine VulkanStory has no
/// payload for. The override only exists beside the test origin.
fn effective_rid() -> Option<String> {
    PLATFORM.effective_rid()
}

fn release_origin() -> String {
    test_origin().unwrap_or_else(|| REPOSITORY.to_string())
}

fn latest_release_url() -> String {
    format!("{}/releases/latest", release_origin())
}

fn archives_url(tag: &str) -> String {
    format!("{}/releases/download/{tag}/archives.json", release_origin())
}

fn archive_url(tag: &str, filename: &str) -> String {
    format!("{}/releases/download/{tag}/{filename}", release_origin())
}

// ── Package inventory ───────────────────────────────────────────────────────

/// The validated inventory of one release package.
#[derive(Debug, Clone)]
pub struct VulkanStoryPackage {
    /// `vs-<game version>-<rid>`, the profile the package was built for.
    pub profile: String,
    pub game_version: String,
    pub rid: String,
    /// Forward-slashed relative path → lowercase SHA-256.
    pub files: BTreeMap<String, String>,
}

/// The raw wire shape, validated into [`VulkanStoryPackage`] by
/// [`parse_package_json`].
#[derive(Deserialize)]
struct RawPackageJson {
    schema: u32,
    product: String,
    profile: String,
    #[serde(default)]
    rid: Option<String>,
    #[serde(default)]
    files: BTreeMap<String, String>,
}

/// Bare 64-character hex in either case; the packaging scripts write uppercase
/// in `archives.json` and in the inventory, and both are normalized here.
fn read_hex_sha256(value: &str) -> Option<String> {
    if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Some(value.to_ascii_lowercase())
    } else {
        None
    }
}

/// Splits `vs-<game version>-<rid>` into its two parts.
fn parse_profile(profile: &str, declared_rid: Option<&str>) -> Option<(String, String)> {
    let rest = profile.strip_prefix("vs-")?;
    let candidates: Vec<&str> = match declared_rid {
        Some(rid) => vec![rid],
        None => KNOWN_RIDS.to_vec(),
    };
    for rid in candidates {
        if let Some(game) = rest.strip_suffix(&format!("-{rid}")) {
            let version = semver::Version::parse(game).ok()?;
            return Some((version.to_string(), rid.to_string()));
        }
    }
    None
}

/// Reads one package inventory. Anything wrong with the version, product,
/// profile or file list answers `None`: this document is the only thing
/// standing between a downloaded archive and the game folder, so a bad header
/// refuses the whole document rather than trusting a partial one.
pub fn parse_package_json(text: &str) -> Option<VulkanStoryPackage> {
    let text = text.trim_start_matches('\u{feff}');
    let raw: RawPackageJson = serde_json::from_str(text).ok()?;
    if raw.schema != 1 || raw.product != "VulkanStory" {
        return None;
    }
    let (game_version, rid) = parse_profile(&raw.profile, raw.rid.as_deref())?;
    if raw.files.is_empty() || raw.files.len() > MAX_PACKAGE_FILES {
        return None;
    }
    let expected = raw.files.len();
    let files: BTreeMap<String, String> = raw
        .files
        .into_iter()
        .filter_map(|(path, hash)| {
            let hash = read_hex_sha256(&hash)?;
            is_safe_relative_path(&path).then_some((path, hash))
        })
        .collect();
    // A path or hash the packaging format never writes means the document is
    // damaged; dropping those entries silently would weaken verification.
    if files.len() != expected {
        return None;
    }
    Some(VulkanStoryPackage {
        profile: raw.profile,
        game_version,
        rid,
        files,
    })
}

/// Reads `<VulkanStory/package.json>` from a downloaded archive.
///
/// Returns the validated inventory and the SHA-256 of the manifest file
/// itself, which the extracted copy is held to as well.
fn read_local_package(archive: &Path) -> Result<(VulkanStoryPackage, String), UiError> {
    let unreadable = |detail: String| {
        UiError::new(
            "vulkanstory_package_unreadable",
            format!("The VulkanStory package could not be read: {detail}"),
        )
    };
    let file = File::open(archive).map_err(|error| unreadable(error.to_string()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|error| unreadable(error.to_string()))?;
    let entry = zip
        .by_name(PACKAGE_JSON_PATH)
        .map_err(|_| unreadable("the archive holds no package inventory".to_string()))?;
    if entry.size() > MAX_PACKAGE_BYTES {
        return Err(unreadable(
            "the package inventory is unexpectedly large".to_string(),
        ));
    }
    let mut text = String::new();
    entry
        .take(MAX_PACKAGE_BYTES + 1)
        .read_to_string(&mut text)
        .map_err(|error| unreadable(error.to_string()))?;
    if text.len() as u64 > MAX_PACKAGE_BYTES {
        return Err(unreadable(
            "the package inventory is unexpectedly large".to_string(),
        ));
    }
    let digest = hex_lower(Sha256::digest(text.as_bytes()).as_slice());
    let package = parse_package_json(&text).ok_or_else(|| {
        unreadable("the package inventory did not survive validation".to_string())
    })?;
    Ok((package, digest))
}

// ── Remote archive reads ────────────────────────────────────────────────────

/// One end-of-central-directory record, as found near the end of an archive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EndRecord {
    Plain { cd_offset: u64, cd_size: u64 },
    Zip64 { zip64_offset: u64 },
}

const EOCD_SIGNATURE: &[u8; 4] = b"PK\x05\x06";
const ZIP64_LOCATOR_SIGNATURE: &[u8; 4] = b"PK\x06\x07";

/// Scans a tail window for the end record, falling back to the zip64 locator
/// when the plain record carries 32-bit sentinels.
fn locate_end_record(tail: &[u8]) -> Option<EndRecord> {
    let index = tail
        .windows(4)
        .rposition(|window| window == EOCD_SIGNATURE)?;
    let record = tail.get(index..index + 22)?;
    let entries_total = u16::from_le_bytes([record[10], record[11]]);
    let cd_size = u32::from_le_bytes([record[12], record[13], record[14], record[15]]);
    let cd_offset = u32::from_le_bytes([record[16], record[17], record[18], record[19]]);
    if cd_size == u32::MAX || cd_offset == u32::MAX || entries_total == u16::MAX {
        let locator = tail
            .windows(4)
            .take(index)
            .rposition(|window| window == ZIP64_LOCATOR_SIGNATURE)?;
        let record = tail.get(locator..locator + 20)?;
        let zip64_offset = u64::from_le_bytes(record[8..16].try_into().ok()?);
        return Some(EndRecord::Zip64 { zip64_offset });
    }
    Some(EndRecord::Plain {
        cd_offset: cd_offset as u64,
        cd_size: cd_size as u64,
    })
}

/// The central directory location from a zip64 end record.
fn parse_zip64_end(record: &[u8]) -> Option<(u64, u64)> {
    if record.len() < 56 || &record[0..4] != b"PK\x06\x06" {
        return None;
    }
    let cd_size = u64::from_le_bytes(record[40..48].try_into().ok()?);
    let cd_offset = u64::from_le_bytes(record[48..56].try_into().ok()?);
    Some((cd_offset, cd_size))
}

/// One central-directory entry's location, enough to fetch its data.
#[derive(Debug, Clone, Copy)]
struct CentralEntry {
    method: u16,
    compressed_size: u64,
    uncompressed_size: u64,
    local_header_offset: u64,
}

/// Reads the zip64 extended-information field for the values that used 32-bit
/// sentinels in the plain entry.
fn parse_zip64_extra(extra: &[u8], needed: [bool; 3]) -> Option<(u64, u64, u64)> {
    let mut position = 0usize;
    while position + 4 <= extra.len() {
        let id = u16::from_le_bytes([extra[position], extra[position + 1]]);
        let size = u16::from_le_bytes([extra[position + 2], extra[position + 3]]) as usize;
        let body = extra.get(position + 4..position + 4 + size)?;
        if id == 0x0001 {
            let mut values = [0u64; 3];
            let mut cursor = 0usize;
            for (index, required) in needed.iter().enumerate() {
                if *required {
                    values[index] =
                        u64::from_le_bytes(body.get(cursor..cursor + 8)?.try_into().ok()?);
                    cursor += 8;
                }
            }
            return Some((values[0], values[1], values[2]));
        }
        position += 4 + size;
    }
    None
}

/// Walks a central directory for one entry by name.
fn find_central_entry(cd: &[u8], name: &str) -> Option<CentralEntry> {
    let mut position = 0usize;
    while position + 46 <= cd.len() {
        let header = cd.get(position..position + 46)?;
        if &header[0..4] != b"PK\x01\x02" {
            return None;
        }
        let method = u16::from_le_bytes([header[10], header[11]]);
        let compressed = u32::from_le_bytes(header[20..24].try_into().ok()?);
        let uncompressed = u32::from_le_bytes(header[24..28].try_into().ok()?);
        let name_length = u16::from_le_bytes([header[28], header[29]]) as usize;
        let extra_length = u16::from_le_bytes([header[30], header[31]]) as usize;
        let comment_length = u16::from_le_bytes([header[32], header[33]]) as usize;
        let local_header = u32::from_le_bytes(header[42..46].try_into().ok()?);
        let entry_name = cd.get(position + 46..position + 46 + name_length)?;
        let extra =
            cd.get(position + 46 + name_length..position + 46 + name_length + extra_length)?;
        let needed = [
            uncompressed == u32::MAX,
            compressed == u32::MAX,
            local_header == u32::MAX,
        ];
        let (uncompressed, compressed, local_header) = if needed.iter().any(|flag| *flag) {
            parse_zip64_extra(extra, needed)?
        } else {
            (uncompressed as u64, compressed as u64, local_header as u64)
        };
        if entry_name == name.as_bytes() {
            return Some(CentralEntry {
                method,
                compressed_size: compressed,
                uncompressed_size: uncompressed,
                local_header_offset: local_header,
            });
        }
        position = position.checked_add(46 + name_length + extra_length + comment_length)?;
    }
    None
}

/// The two lengths in a local file header that place the entry's data.
struct LocalHeader {
    name_length: u16,
    extra_length: u16,
}

fn parse_local_header(header: &[u8]) -> Option<LocalHeader> {
    if header.len() < 30 || &header[0..4] != b"PK\x03\x04" {
        return None;
    }
    Some(LocalHeader {
        name_length: u16::from_le_bytes([header[26], header[27]]),
        extra_length: u16::from_le_bytes([header[28], header[29]]),
    })
}

/// Decompresses one entry's data and holds it to its declared length.
fn inflate_entry(
    compressed: &[u8],
    method: u16,
    expected_length: u64,
    max_bytes: u64,
) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(expected_length.min(64 * 1024) as usize);
    match method {
        0 => out.extend_from_slice(compressed),
        8 => {
            let decoder = flate2::read::DeflateDecoder::new(compressed);
            decoder.take(max_bytes + 1).read_to_end(&mut out).ok()?;
        }
        _ => return None,
    }
    if out.len() as u64 > max_bytes || out.len() as u64 != expected_length {
        return None;
    }
    Some(out)
}

/// One byte range of a remote file.
async fn range_bytes(
    client: &reqwest::Client,
    url: &str,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, ManifestFailure> {
    let response = client
        .get(url)
        .header(reqwest::header::RANGE, format!("bytes={start}-{end}"))
        .send()
        .await
        .map_err(|error| {
            log_error!("[vulkanstory] range request failed: {error}");
            ManifestFailure::Unreachable
        })?;
    if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        // A host that ignores `Range` would answer with the whole archive;
        // reading the package inventory must never pull 148 MB.
        log_error!("[vulkanstory] range request answered {}", response.status());
        return Err(ManifestFailure::Unreadable);
    }
    let bytes = response.bytes().await.map_err(|error| {
        log_error!("[vulkanstory] range read failed: {error}");
        ManifestFailure::Unreachable
    })?;
    if bytes.len() != (end - start + 1) as usize {
        return Err(ManifestFailure::Unreadable);
    }
    Ok(bytes.to_vec())
}

/// The total length of a remote file, from a HEAD or, failing that, from the
/// total a one-byte range read reports.
async fn remote_content_length(
    client: &reqwest::Client,
    url: &str,
) -> Result<u64, ManifestFailure> {
    let response = client.head(url).send().await.map_err(|error| {
        log_error!("[vulkanstory] HEAD failed: {error}");
        ManifestFailure::Unreachable
    })?;
    if !response.status().is_success() {
        return Err(ManifestFailure::Unreachable);
    }
    if let Some(length) = response.content_length() {
        if length > 0 {
            return Ok(length);
        }
    }
    let response = client
        .get(url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|_| ManifestFailure::Unreachable)?;
    if response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(ManifestFailure::Unreachable);
    }
    let header = response
        .headers()
        .get(reqwest::header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .ok_or(ManifestFailure::Unreadable)?;
    header
        .split_once('/')
        .and_then(|(_, total)| total.trim().parse::<u64>().ok())
        .ok_or(ManifestFailure::Unreadable)
}

/// Reads one small file out of a remote ZIP over range requests.
async fn read_remote_zip_entry(
    client: &reqwest::Client,
    url: &str,
    name: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, ManifestFailure> {
    let total = remote_content_length(client, url).await?;
    if total < 22 {
        return Err(ManifestFailure::Unreadable);
    }
    let window = total.min(EOCD_WINDOW);
    let tail = range_bytes(client, url, total - window, total - 1).await?;
    let (cd_offset, cd_size) = match locate_end_record(&tail).ok_or(ManifestFailure::Unreadable)? {
        EndRecord::Plain { cd_offset, cd_size } => (cd_offset, cd_size),
        EndRecord::Zip64 { zip64_offset } => {
            let record = range_bytes(client, url, zip64_offset, zip64_offset + 55).await?;
            parse_zip64_end(&record).ok_or(ManifestFailure::Unreadable)?
        }
    };
    if cd_size == 0 || cd_size > MAX_CENTRAL_DIRECTORY_BYTES || cd_offset >= total {
        return Err(ManifestFailure::Unreadable);
    }
    let cd = range_bytes(client, url, cd_offset, cd_offset + cd_size - 1).await?;
    let entry = find_central_entry(&cd, name).ok_or(ManifestFailure::Unreadable)?;
    if entry.uncompressed_size > max_bytes {
        return Err(ManifestFailure::Unreadable);
    }
    // Deflate cannot expand a payload into something below its own size, and
    // stored entries are byte-for-byte; the cap keeps a crafted entry from
    // turning one inventory read into an unbounded download.
    if entry.compressed_size > max_bytes.saturating_mul(4) {
        return Err(ManifestFailure::Unreadable);
    }
    let header = range_bytes(
        client,
        url,
        entry.local_header_offset,
        entry.local_header_offset + 29,
    )
    .await?;
    let header = parse_local_header(&header).ok_or(ManifestFailure::Unreadable)?;
    let data_offset = entry
        .local_header_offset
        .checked_add(30)
        .and_then(|offset| offset.checked_add(header.name_length as u64))
        .and_then(|offset| offset.checked_add(header.extra_length as u64))
        .ok_or(ManifestFailure::Unreadable)?;
    let data_end = data_offset
        .checked_add(entry.compressed_size)
        .ok_or(ManifestFailure::Unreadable)?;
    if data_end > total {
        return Err(ManifestFailure::Unreadable);
    }
    let data = range_bytes(client, url, data_offset, data_end - 1).await?;
    inflate_entry(&data, entry.method, entry.uncompressed_size, max_bytes)
        .ok_or(ManifestFailure::Unreadable)
}

/// A test-only read of one entry from a complete in-memory archive, using the
/// same pure helpers as [`read_remote_zip_entry`].
#[cfg(test)]
fn read_entry_from_bytes(zip_bytes: &[u8], name: &str, max_bytes: u64) -> Option<Vec<u8>> {
    let (cd_offset, cd_size) = match locate_end_record(zip_bytes)? {
        EndRecord::Plain { cd_offset, cd_size } => (cd_offset, cd_size),
        EndRecord::Zip64 { zip64_offset } => {
            let record = zip_bytes.get(zip64_offset as usize..(zip64_offset + 56) as usize)?;
            parse_zip64_end(record)?
        }
    };
    let cd = zip_bytes.get(cd_offset as usize..(cd_offset + cd_size) as usize)?;
    let entry = find_central_entry(cd, name)?;
    if entry.uncompressed_size > max_bytes {
        return None;
    }
    let header = zip_bytes
        .get(entry.local_header_offset as usize..(entry.local_header_offset + 30) as usize)?;
    let header = parse_local_header(header)?;
    let data_offset =
        entry.local_header_offset + 30 + header.name_length as u64 + header.extra_length as u64;
    let data_end = data_offset + entry.compressed_size;
    let data = zip_bytes.get(data_offset as usize..data_end as usize)?;
    inflate_entry(data, entry.method, entry.uncompressed_size, max_bytes)
}

// ── Release metadata ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct RawArchiveEntry {
    file: String,
    sha256: String,
}

/// Everything the install flow needs about the latest release.
#[derive(Debug, Clone)]
struct VulkanStoryManifest {
    /// Release tag, e.g. `v0.1.1`; all URLs are pinned to it.
    tag: String,
    /// Product version without the tag prefix, e.g. `0.1.1`.
    version: String,
    rid: String,
    filename: String,
    size: u64,
    sha256: String,
    game_version: String,
}

/// The release tag from a `/releases/latest` redirect location.
fn parse_tag_from_location(location: &str) -> Option<String> {
    let (_, rest) = location.rsplit_once("/releases/tag/")?;
    let tag = rest.split(['?', '#']).next()?;
    if tag.is_empty() || tag.len() > 128 {
        return None;
    }
    semver::Version::parse(tag.strip_prefix('v')?).ok()?;
    Some(tag.to_string())
}

async fn fetch_latest_tag(client: &reqwest::Client) -> Result<String, ManifestFailure> {
    // `/releases/latest` answers with a redirect to `/releases/tag/<tag>`;
    // following it with a HEAD (no body) puts the tag in the final URL.
    let response = client
        .head(latest_release_url())
        .send()
        .await
        .map_err(|error| {
            log_error!("[vulkanstory] latest release request failed: {error}");
            ManifestFailure::Unreachable
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND
        || response.status() == reqwest::StatusCode::GONE
    {
        return Err(ManifestFailure::NotPublished);
    }
    if !response.status().is_success() {
        log_error!(
            "[vulkanstory] latest release request returned {}",
            response.status()
        );
        return Err(ManifestFailure::Unreachable);
    }
    parse_tag_from_location(response.url().as_str()).ok_or(ManifestFailure::Unreadable)
}

/// The archive entry for `rid` in a release's `archives.json`.
async fn fetch_archive_entry(
    client: &reqwest::Client,
    tag: &str,
    rid: &str,
) -> Result<(String, String), ManifestFailure> {
    let response = client
        .get(archives_url(tag))
        .send()
        .await
        .map_err(|error| {
            log_error!("[vulkanstory] archives request failed: {error}");
            ManifestFailure::Unreachable
        })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND
        || response.status() == reqwest::StatusCode::GONE
    {
        return Err(ManifestFailure::NotPublished);
    }
    if !response.status().is_success() {
        log_error!(
            "[vulkanstory] archives request returned {}",
            response.status()
        );
        return Err(ManifestFailure::Unreachable);
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MANIFEST_BYTES)
    {
        return Err(ManifestFailure::Unreadable);
    }
    let bytes = response.bytes().await.map_err(|error| {
        log_error!("[vulkanstory] archives read failed: {error}");
        ManifestFailure::Unreachable
    })?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(ManifestFailure::Unreadable);
    }
    let entries: Vec<RawArchiveEntry> =
        serde_json::from_slice(&bytes).map_err(|_| ManifestFailure::Unreadable)?;
    // The name is built from the rid rather than matched by pattern, so this
    // check cannot drift from the download URL.
    let filename = format!("VulkanStory-{rid}.zip");
    let entry = entries
        .into_iter()
        .find(|entry| entry.file == filename)
        .ok_or(ManifestFailure::NotPublished)?;
    let sha256 = read_hex_sha256(&entry.sha256).ok_or(ManifestFailure::Unreadable)?;
    Ok((filename, sha256))
}

async fn fetch_manifest(client: &reqwest::Client) -> Result<VulkanStoryManifest, ManifestFailure> {
    let rid = effective_rid().ok_or(ManifestFailure::UnsupportedSystem)?;
    let tag = fetch_latest_tag(client).await?;
    let (filename, sha256) = fetch_archive_entry(client, &tag, &rid).await?;
    let url = archive_url(&tag, &filename);
    let size = remote_content_length(client, &url).await?;
    let package_bytes =
        read_remote_zip_entry(client, &url, PACKAGE_JSON_PATH, MAX_PACKAGE_BYTES).await?;
    let text = String::from_utf8(package_bytes).map_err(|_| ManifestFailure::Unreadable)?;
    let package = parse_package_json(&text).ok_or(ManifestFailure::Unreadable)?;
    if package.rid != rid {
        return Err(ManifestFailure::UnsupportedSystem);
    }
    let version = tag.strip_prefix('v').unwrap_or(&tag).to_string();
    Ok(VulkanStoryManifest {
        tag,
        version,
        rid,
        filename,
        size,
        sha256,
        game_version: package.game_version,
    })
}

static MANIFEST_CACHE: OnceLock<Mutex<Option<CachedManifest<VulkanStoryManifest>>>> =
    OnceLock::new();

fn manifest_cache() -> &'static Mutex<Option<CachedManifest<VulkanStoryManifest>>> {
    MANIFEST_CACHE.get_or_init(|| Mutex::new(None))
}

/// The cached manifest, or a fresh one. `refresh` forces the network read the
/// UI asks for when the install sheet opens.
///
/// VulkanStory caches the fetched manifest here, after its fetch answered, the
/// way this module always did; the shared read-through is asked to do that
/// (`true`).
async fn manifest_for_session(
    client: &reqwest::Client,
    refresh: bool,
) -> Result<VulkanStoryManifest, ManifestFailure> {
    client_fork::manifest_for_session(manifest_cache(), refresh, true, fetch_manifest(client)).await
}

// ── Status command ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VulkanStoryManifestInfo {
    pub vulkanstory_version: String,
    pub supported_game_versions: Vec<String>,
    pub rid: String,
    pub archive_filename: String,
    pub archive_size: u64,
}

/// The status of the VulkanStory feature on this host.
pub type VulkanStoryStatus = ForkStatus<VulkanStoryManifestInfo>;

#[command]
pub async fn get_vulkanstory_status(
    client: State<'_, Arc<reqwest::Client>>,
    refresh: Option<bool>,
) -> Result<VulkanStoryStatus, UiError> {
    log_info!("get_vulkanstory_status: refresh={refresh:?}");
    let client: &reqwest::Client = &client;
    let rid = effective_rid();
    if rid.is_none() {
        return Ok(VulkanStoryStatus {
            platform_supported: false,
            rid: None,
            reason: Some(ManifestFailure::UnsupportedSystem.reason().to_string()),
            manifest: None,
        });
    }
    let rid = rid.unwrap_or_default();
    match manifest_for_session(client, refresh.unwrap_or(false)).await {
        Ok(manifest) => Ok(VulkanStoryStatus {
            platform_supported: true,
            rid: Some(rid),
            reason: None,
            manifest: Some(VulkanStoryManifestInfo {
                vulkanstory_version: manifest.version.clone(),
                supported_game_versions: vec![manifest.game_version.clone()],
                rid: manifest.rid.clone(),
                archive_filename: manifest.filename.clone(),
                archive_size: manifest.size,
            }),
        }),
        Err(failure) => {
            log_info!(
                "[vulkanstory] no usable manifest this session: {}",
                failure.reason()
            );
            Ok(VulkanStoryStatus {
                platform_supported: true,
                rid: Some(rid),
                reason: Some(failure.reason().to_string()),
                manifest: None,
            })
        }
    }
}

// ── Progress emitter ────────────────────────────────────────────────────────

/// Progress payload sent on the install event.
pub type VulkanStoryProgress = ForkProgress;

/// Emits [`VulkanStoryProgress`] on the install event.
pub type VulkanStoryEmitter = ForkEmitter;

fn cancelled_error() -> UiError {
    client_fork::cancelled_error("VulkanStory")
}

// ── Copy / extract / verify ─────────────────────────────────────────────────

/// Extracts a release package into `target`.
///
/// Every entry must be a plain file or folder with a relative, forward-slashed
/// path; anything else refuses the whole package. When `preserve_loader_ini`
/// is set, an existing `VulkanStory/loader.ini` is left alone so a user's
/// `Enabled=0` switch survives an update.
fn extract_package(
    archive: &Path,
    target: &Path,
    preserve_loader_ini: bool,
    emitter: Option<&VulkanStoryEmitter>,
    token: &CancellationToken,
) -> Result<(), UiError> {
    let unreadable = |detail: String| {
        UiError::new(
            "vulkanstory_package_unreadable",
            format!("The VulkanStory package could not be read: {detail}"),
        )
    };
    let file = File::open(archive).map_err(|error| unreadable(error.to_string()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|error| unreadable(error.to_string()))?;
    let total_entries = zip.len() as u64;
    let mut last_emit = Instant::now();

    for index in 0..zip.len() {
        if is_cancelled(token) {
            return Err(cancelled_error());
        }
        let mut entry = zip
            .by_index(index)
            .map_err(|error| unreadable(error.to_string()))?;
        let name = entry
            .name()
            .map_err(|error| unreadable(error.to_string()))?
            .into_owned();
        if !is_safe_relative_path(&name) {
            return Err(unreadable(format!(
                "the package holds a path that escapes the game folder: {name}"
            )));
        }
        // A symlink would let the package write outside the copy it owns.
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170_000 == 0o120_000)
        {
            return Err(unreadable(format!("the package holds a symlink: {name}")));
        }
        let destination = target.join(name.replace('/', std::path::MAIN_SEPARATOR_STR));
        if entry.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| {
                UiError::io(format!(
                    "Failed to create {}: {error}",
                    destination.display()
                ))
            })?;
        } else {
            if preserve_loader_ini && name == LOADER_INI_PATH {
                continue;
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    UiError::io(format!("Failed to create {}: {error}", parent.display()))
                })?;
            }
            let mut output = File::create(&destination).map_err(|error| {
                UiError::io(format!(
                    "Failed to create {}: {error}",
                    destination.display()
                ))
            })?;
            std::io::copy(&mut entry, &mut output).map_err(|error| {
                UiError::io(format!(
                    "Failed to extract {}: {error}",
                    destination.display()
                ))
            })?;
        }
        if last_emit.elapsed() >= Duration::from_millis(100) {
            let percent = 55 + ((index as u64 + 1) * 30) / total_entries.max(1);
            if let Some(emitter) = emitter {
                emitter.emit("extract", percent.min(85) as u8, None);
            }
            last_emit = Instant::now();
        }
    }
    Ok(())
}

/// Whether the extracted copy is byte for byte what the inventory published.
fn verify_payload(
    target: &Path,
    package: &VulkanStoryPackage,
    preserved_loader_ini: bool,
    emitter: Option<&VulkanStoryEmitter>,
) -> Result<(), UiError> {
    let total = package.files.len() as u64;
    let mut checked = 0u64;
    for (path, expected) in &package.files {
        if preserved_loader_ini && path == LOADER_INI_PATH {
            continue;
        }
        let file = target.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let metadata = fs::metadata(&file).map_err(|_| {
            UiError::new(
                "vulkanstory_verification_failed",
                format!("The extracted package is missing {path}"),
            )
        })?;
        if !metadata.is_file() || &sha256_file(&file)? != expected {
            return Err(UiError::new(
                "vulkanstory_verification_failed",
                format!("Extracted file failed its hash: {path}"),
            ));
        }
        checked += 1;
        if let Some(emitter) = emitter {
            emitter.emit("verify", (90 + (checked * 5 / total.max(1))) as u8, None);
        }
    }
    Ok(())
}

/// The package's per-game profile, which pins the official game files the
/// package was built against.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameProfile {
    schema: u32,
    id: String,
    game_version: String,
    files: BTreeMap<String, String>,
}

/// Whether the game files below the package are the official ones.
///
/// The upstream installers refuse to install beside a modified client, and so
/// does this: the package is only expected to work against the exact official
/// files it was built for. Extra files are fine; a differing official file is
/// not, because the renderer loads those assemblies.
fn verify_official_files(target: &Path, package: &VulkanStoryPackage) -> Result<(), UiError> {
    let profile_path = target
        .join("VulkanStory")
        .join("managed")
        .join("profiles")
        .join(format!("{}.json", package.profile));
    let text = fs::read_to_string(&profile_path).map_err(|_| {
        UiError::new(
            "vulkanstory_verification_failed",
            "The package holds no game profile",
        )
    })?;
    if text.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(UiError::new(
            "vulkanstory_verification_failed",
            "The package game profile is unexpectedly large",
        ));
    }
    let profile: GameProfile = serde_json::from_str(&text).map_err(|_| {
        UiError::new(
            "vulkanstory_verification_failed",
            "The package game profile is unreadable",
        )
    })?;
    if profile.schema != 1
        || profile.id != package.profile
        || profile.game_version != package.game_version
        || profile.files.is_empty()
    {
        return Err(UiError::new(
            "vulkanstory_verification_failed",
            "The package game profile does not match the package",
        ));
    }
    for (path, expected) in &profile.files {
        let expected = read_hex_sha256(expected).ok_or_else(|| {
            UiError::new(
                "vulkanstory_verification_failed",
                "The package game profile holds a bad hash",
            )
        })?;
        if !is_safe_relative_path(path) {
            return Err(UiError::new(
                "vulkanstory_verification_failed",
                "The package game profile holds an unsafe path",
            ));
        }
        let file = target.join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let metadata = fs::metadata(&file).map_err(|_| {
            UiError::new(
                "vulkanstory_official_mismatch",
                format!("This version is missing an official game file: {path}"),
            )
        })?;
        if !metadata.is_file() || sha256_file(&file)? != expected {
            return Err(UiError::new(
                "vulkanstory_official_mismatch",
                format!("Official game file does not match what VulkanStory expects: {path}"),
            ));
        }
    }
    Ok(())
}

// ── Install ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VulkanStoryInstallResult {
    pub version: String,
    pub vulkanstory_version: String,
}

static INSTALL_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Installs or updates VulkanStory for `base_version`.
///
/// The vanilla base version is copied to `<base>+vulkanstory` and the package
/// is extracted into the copy. An existing `+vulkanstory` folder is updated in
/// place instead: the new package's files are extracted over it, which
/// converges because every file it writes is verified afterwards.
#[command]
pub async fn install_vulkanstory(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    base_version: String,
    emitevent: String,
) -> Result<VulkanStoryInstallResult, UiError> {
    let _install_guard = InstallGuard::acquire(&INSTALL_ACTIVE).ok_or_else(|| {
        UiError::new(
            "vulkanstory_busy",
            "Another VulkanStory install is already running",
        )
    })?;
    let client: &reqwest::Client = &client;

    let (emitter, token, _listener_guard) = install_cancellation(&app, &emitevent);

    log_info!("[vulkanstory] install requested for base {base_version}");
    emitter.emit("manifest", 0, None);

    if is_vulkanstory_version(&base_version) || super::optimum::is_optimum_version(&base_version) {
        return Err(UiError::new(
            "vulkanstory_bad_input",
            "VulkanStory must be installed for a vanilla version",
        ));
    }

    let manifest = match manifest_for_session(client, false).await {
        Ok(manifest) => manifest,
        Err(failure) => {
            return Err(UiError::new(
                "vulkanstory_manifest_unavailable",
                failure.reason(),
            ));
        }
    };
    if manifest.game_version != base_version {
        return Err(UiError::new(
            "vulkanstory_unsupported_version",
            format!(
                "VulkanStory {} has no build for version {base_version}",
                manifest.version
            ),
        ));
    }

    // The base may be managed or linked; the VulkanStory build always lands in
    // the managed versions folder so it is scanned and removable like any
    // version.
    let base_dir = require_ready_base(&app, &base_version, "vulkanstory_incomplete_version")?;

    let app_data = app_data_dir(&app)?;
    let target_name = vulkanstory_version_name(&base_version);
    let target_dir = versions_folder(app.clone())?
        .join(versions_subdir(app.clone()))
        .join(&target_name);
    require_managed_path(&app, &target_dir, "Versions path")?;

    let updating = target_dir.is_dir();
    let mut cleanup: Option<CleanupTarget> = None;
    if updating {
        if read_vulkanstory_version(&target_dir).is_none() {
            return Err(UiError::new(
                "vulkanstory_target_exists",
                format!("A folder named {target_name} already exists"),
            ));
        }
        log_info!(
            "[vulkanstory] updating existing build at {}",
            target_dir.display()
        );
    } else {
        cleanup = Some(CleanupTarget::defer(target_dir.clone()));
    }

    // The archive cache is verified once per release and reused without
    // touching the network for the payload.
    let downloads_dir = app_data.join("vulkanstory").join("downloads");
    fs::create_dir_all(&downloads_dir)
        .map_err(|error| UiError::io(format!("Failed to create package cache: {error}")))?;
    let archive_path = downloads_dir.join(&manifest.filename);
    let archive_ok = cached_archive_is_valid(&archive_path, manifest.size, &manifest.sha256);
    if !archive_ok {
        let url = archive_url(&manifest.tag, &manifest.filename);
        log_info!("[vulkanstory] downloading {url}");
        emitter.emit("download", 5, None);
        let emitter_for_progress = emitter.clone();
        let size = manifest.size;
        download_archive(
            client,
            &ArchiveDownload {
                url: &url,
                dest: &archive_path,
                expected_size: manifest.size,
                expected_sha256: &manifest.sha256,
                max_bytes: MAX_ARCHIVE_BYTES,
                product: "VulkanStory",
                archive: "package archive",
            },
            &token,
            move |written, _total| {
                let progress = 5 + ((written as f64 / size as f64) * 25.0) as u64;
                emitter_for_progress.emit("download", progress.min(30) as u8, None);
            },
        )
        .await?;
    } else {
        log_info!(
            "[vulkanstory] reusing verified package at {}",
            archive_path.display()
        );
    }

    // The inventory inside the verified archive is the authority for what the
    // extraction may write; a package built for another game version refuses
    // before the target is touched.
    let (package, package_digest) = read_local_package(&archive_path)?;
    if package.game_version != base_version || package.rid != manifest.rid {
        return Err(UiError::new(
            "vulkanstory_unsupported_version",
            format!(
                "VulkanStory {} has no build for version {base_version}",
                manifest.version
            ),
        ));
    }

    // A fresh install copies the base first; an update extracts over the
    // existing build, keeping the user's loader configuration.
    let preserve_loader_ini = updating
        && target_dir
            .join(LOADER_INI_PATH.replace('/', std::path::MAIN_SEPARATOR_STR))
            .is_file();
    copy_base(
        updating,
        &base_dir,
        &target_dir,
        &emitter,
        &token,
        (35, 50),
        &PLATFORM,
    )?;

    emitter.emit("extract", 55, None);
    if let Err(error) = extract_package(
        &archive_path,
        &target_dir,
        preserve_loader_ini,
        Some(&emitter),
        &token,
    ) {
        if error.name == "cancelled" {
            emitter.emit("cancelled", 0, None);
        }
        return Err(error);
    }
    if is_cancelled(&token) {
        emitter.emit("cancelled", 0, None);
        return Err(cancelled_error());
    }

    emitter.emit("verify", 90, None);
    verify_payload(&target_dir, &package, preserve_loader_ini, Some(&emitter))?;
    // The inventory file the extracted copy carries must be byte for byte the
    // one that was validated; later updates trust it as the record of what is
    // owned.
    let package_path =
        target_dir.join(PACKAGE_JSON_PATH.replace('/', std::path::MAIN_SEPARATOR_STR));
    if sha256_file(&package_path)? != package_digest {
        return Err(UiError::new(
            "vulkanstory_verification_failed",
            "The extracted package inventory changed",
        ));
    }
    verify_official_files(&target_dir, &package)?;

    let state_dir = target_dir.join(VULKANSTORY_STATE_FOLDER);
    fs::create_dir_all(&state_dir)
        .map_err(|error| UiError::io(format!("Failed to create install state: {error}")))?;
    let record = InstallRecord {
        schema: 1,
        vulkanstory_version: manifest.version.clone(),
        base_game_version: base_version.clone(),
        rid: manifest.rid.clone(),
        archive_filename: manifest.filename.clone(),
        archive_sha256: manifest.sha256.clone(),
    };
    let record_text = serde_json::to_string_pretty(&record).map_err(|error| {
        UiError::new("serialize_failed", format!("Failed to serialize: {error}"))
    })?;
    fs::write(state_dir.join(VULKANSTORY_INSTALL_RECORD), record_text)
        .map_err(|error| UiError::io(format!("Failed to write install state: {error}")))?;

    finish_install(
        &mut cleanup,
        &emitter,
        &PLATFORM,
        &manifest.version,
        &target_name,
        &target_dir,
    );
    Ok(VulkanStoryInstallResult {
        version: target_name,
        vulkanstory_version: manifest.version,
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::io::Write;

    fn sha_of(bytes: &[u8]) -> String {
        hex_lower(Sha256::digest(bytes).as_slice())
    }

    fn package_json(files: &[(&str, &str)]) -> String {
        let files: serde_json::Map<String, Value> = files
            .iter()
            .map(|(path, hash)| (path.to_string(), Value::String(hash.to_string())))
            .collect();
        serde_json::json!({
            "schema": 1,
            "product": "VulkanStory",
            "profile": "vs-1.22.7-win-x64",
            "rid": "win-x64",
            "files": files,
        })
        .to_string()
    }

    fn package_for(files: &[(&str, &[u8])]) -> VulkanStoryPackage {
        VulkanStoryPackage {
            profile: "vs-1.22.7-win-x64".to_string(),
            game_version: "1.22.7".to_string(),
            rid: "win-x64".to_string(),
            files: files
                .iter()
                .map(|(path, bytes)| (path.to_string(), sha_of(bytes)))
                .collect(),
        }
    }

    fn build_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        use zip::write::SimpleFileOptions;
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in entries {
            writer.start_file(*name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn version_naming_helpers() {
        assert!(is_vulkanstory_version("1.22.7+vulkanstory"));
        assert!(!is_vulkanstory_version("1.22.7"));
        assert_eq!(vulkanstory_version_name("1.22.7"), "1.22.7+vulkanstory");
    }

    #[test]
    fn parses_profiles() {
        assert_eq!(
            parse_profile("vs-1.22.7-win-x64", Some("win-x64")),
            Some(("1.22.7".to_string(), "win-x64".to_string()))
        );
        assert_eq!(
            parse_profile("vs-1.22.7-linux-x64", None),
            Some(("1.22.7".to_string(), "linux-x64".to_string()))
        );
        // The declared rid must agree with the profile name.
        assert_eq!(parse_profile("vs-1.22.7-linux-x64", Some("win-x64")), None);
        assert_eq!(parse_profile("vs-garbage-win-x64", None), None);
        assert_eq!(parse_profile("1.22.7-win-x64", None), None);
    }

    #[test]
    fn read_hex_sha256_normalizes_case() {
        let upper = "A".repeat(64);
        assert_eq!(read_hex_sha256(&upper), Some("a".repeat(64)));
        assert_eq!(read_hex_sha256(&"g".repeat(64)), None);
        assert_eq!(read_hex_sha256("abc"), None);
    }

    #[test]
    fn parses_a_valid_package() {
        let hash = "a".repeat(64);
        let text = package_json(&[("hostfxr.dll", &hash)]);
        let package = parse_package_json(&text).expect("package should parse");
        assert_eq!(package.profile, "vs-1.22.7-win-x64");
        assert_eq!(package.game_version, "1.22.7");
        assert_eq!(package.rid, "win-x64");
        assert_eq!(package.files.len(), 1);

        // A UTF-8 byte order mark is tolerated.
        let text = format!("\u{feff}{text}");
        assert!(parse_package_json(&text).is_some());
    }

    #[test]
    fn rejects_bad_packages() {
        let hash = "b".repeat(64);

        // Wrong product or schema.
        let text = package_json(&[("hostfxr.dll", &hash)]).replace("VulkanStory", "Something");
        assert!(parse_package_json(&text).is_none());
        let text = package_json(&[("hostfxr.dll", &hash)]).replace("\"schema\":1", "\"schema\":2");
        assert!(parse_package_json(&text).is_none());

        // Uppercase hashes are accepted, malformed ones are not.
        let text = package_json(&[("hostfxr.dll", &hash.to_uppercase())]);
        assert!(parse_package_json(&text).is_some());
        let text = package_json(&[("hostfxr.dll", "nope")]);
        assert!(parse_package_json(&text).is_none());

        // Path traversal and absolute paths.
        let text = package_json(&[("../evil", &hash)]);
        assert!(parse_package_json(&text).is_none());
        let text = package_json(&[("/etc/passwd", &hash)]);
        assert!(parse_package_json(&text).is_none());

        // An empty inventory vouches for nothing.
        let text = package_json(&[]);
        assert!(parse_package_json(&text).is_none());
    }

    #[test]
    fn parses_tag_from_locations() {
        assert_eq!(
            parse_tag_from_location(
                "https://github.com/KillerPixelCrew/VulkanStory/releases/tag/v0.1.1"
            ),
            Some("v0.1.1".to_string())
        );
        assert_eq!(
            parse_tag_from_location("http://127.0.0.1:8971/releases/tag/v12.0.0?x=1"),
            Some("v12.0.0".to_string())
        );
        assert_eq!(
            parse_tag_from_location("https://github.com/foo/bar/releases/tag/latest"),
            None
        );
        assert_eq!(parse_tag_from_location("https://github.com/foo/bar"), None);
    }

    #[test]
    fn locates_end_records() {
        let mut record = Vec::new();
        record.extend_from_slice(EOCD_SIGNATURE);
        record.extend_from_slice(&[0, 0, 0, 0]);
        record.extend_from_slice(&7u16.to_le_bytes());
        record.extend_from_slice(&7u16.to_le_bytes());
        record.extend_from_slice(&11u32.to_le_bytes());
        record.extend_from_slice(&22u32.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        let mut tail = vec![0u8; 10];
        tail.extend_from_slice(&record);
        assert_eq!(
            locate_end_record(&tail),
            Some(EndRecord::Plain {
                cd_offset: 22,
                cd_size: 11
            })
        );

        // Sentinels switch the scan to the zip64 locator.
        let mut record = Vec::new();
        record.extend_from_slice(EOCD_SIGNATURE);
        record.extend_from_slice(&[0, 0, 0, 0]);
        record.extend_from_slice(&u16::MAX.to_le_bytes());
        record.extend_from_slice(&u16::MAX.to_le_bytes());
        record.extend_from_slice(&u32::MAX.to_le_bytes());
        record.extend_from_slice(&u32::MAX.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        let mut locator = Vec::new();
        locator.extend_from_slice(ZIP64_LOCATOR_SIGNATURE);
        locator.extend_from_slice(&0u32.to_le_bytes());
        locator.extend_from_slice(&1234u64.to_le_bytes());
        locator.extend_from_slice(&1u32.to_le_bytes());
        let mut tail = locator;
        tail.extend_from_slice(&record);
        assert_eq!(
            locate_end_record(&tail),
            Some(EndRecord::Zip64 { zip64_offset: 1234 })
        );
    }

    #[test]
    fn parses_zip64_end_records() {
        let mut record = vec![0u8; 56];
        record[0..4].copy_from_slice(b"PK\x06\x06");
        record[40..48].copy_from_slice(&99u64.to_le_bytes());
        record[48..56].copy_from_slice(&123u64.to_le_bytes());
        assert_eq!(parse_zip64_end(&record), Some((123, 99)));
        assert!(parse_zip64_end(&record[..10]).is_none());
    }

    #[test]
    fn reads_zip_entries_from_bytes() {
        let zip = build_zip(&[
            ("VulkanStory/package.json", b"{\"a\":1}"),
            ("hostfxr.dll", b"binary"),
        ]);
        assert_eq!(
            read_entry_from_bytes(&zip, "VulkanStory/package.json", 1024).unwrap(),
            b"{\"a\":1}"
        );
        assert_eq!(
            read_entry_from_bytes(&zip, "hostfxr.dll", 1024).unwrap(),
            b"binary"
        );
        assert!(read_entry_from_bytes(&zip, "missing.dll", 1024).is_none());
        // The output cap refuses an entry that does not fit.
        assert!(read_entry_from_bytes(&zip, "hostfxr.dll", 3).is_none());
    }

    #[test]
    fn extracts_and_verifies_a_payload() {
        let dir = tempfile::tempdir().unwrap();
        let payload = b"content";
        let digest = sha_of(payload);
        let inventory = package_json(&[
            ("VulkanStory/loader.ini", &digest),
            ("hostfxr.dll", &sha_of(b"binary")),
        ]);
        let zip = build_zip(&[
            ("VulkanStory/loader.ini", payload),
            ("VulkanStory/", b""),
            ("hostfxr.dll", b"binary"),
            (PACKAGE_JSON_PATH, inventory.as_bytes()),
        ]);
        let archive = dir.path().join("package.zip");
        fs::write(&archive, &zip).unwrap();
        let target = dir.path().join("target");
        fs::create_dir_all(&target).unwrap();

        let token = CancellationToken::new();
        extract_package(&archive, &target, false, None, &token).unwrap();
        assert_eq!(
            fs::read(target.join("VulkanStory/loader.ini")).unwrap(),
            payload
        );

        let (package, package_digest) = read_local_package(&archive).unwrap();
        assert_eq!(package.game_version, "1.22.7");
        assert_eq!(package.rid, "win-x64");
        verify_payload(&target, &package, false, None).unwrap();
        assert_eq!(
            sha256_file(&target.join(PACKAGE_JSON_PATH)).unwrap(),
            package_digest
        );

        // A tampered file is refused.
        fs::write(target.join("hostfxr.dll"), b"changed").unwrap();
        let error = verify_payload(&target, &package, false, None).unwrap_err();
        assert_eq!(error.name, "vulkanstory_verification_failed");
    }

    #[test]
    fn updates_preserve_the_loader_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let payload = b"content";
        let inventory = package_json(&[("VulkanStory/loader.ini", &sha_of(payload))]);
        let zip = build_zip(&[
            ("VulkanStory/loader.ini", payload),
            (PACKAGE_JSON_PATH, inventory.as_bytes()),
        ]);
        let archive = dir.path().join("package.zip");
        fs::write(&archive, &zip).unwrap();
        let target = dir.path().join("target");
        fs::create_dir_all(target.join("VulkanStory")).unwrap();
        fs::write(target.join("VulkanStory/loader.ini"), b"Enabled=0\n").unwrap();

        let token = CancellationToken::new();
        extract_package(&archive, &target, true, None, &token).unwrap();
        assert_eq!(
            fs::read(target.join("VulkanStory/loader.ini")).unwrap(),
            b"Enabled=0\n",
            "a user's loader switch survives an update"
        );

        let (package, _) = read_local_package(&archive).unwrap();
        verify_payload(&target, &package, true, None).unwrap();
        // Without the preserve flag the edited file is a verification failure.
        let error = verify_payload(&target, &package, false, None).unwrap_err();
        assert_eq!(error.name, "vulkanstory_verification_failed");
    }

    #[test]
    fn refuses_packages_with_unsafe_paths() {
        let dir = tempfile::tempdir().unwrap();
        let zip = build_zip(&[("../evil", b"x")]);
        let archive = dir.path().join("package.zip");
        fs::write(&archive, &zip).unwrap();
        let target = dir.path().join("target");
        fs::create_dir_all(&target).unwrap();

        let error =
            extract_package(&archive, &target, false, None, &CancellationToken::new()).unwrap_err();
        assert_eq!(error.name, "vulkanstory_package_unreadable");
        assert!(!dir.path().join("evil").exists());
    }

    #[test]
    fn official_profile_mismatch_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target");
        fs::create_dir_all(target.join("VulkanStory/managed/profiles")).unwrap();
        fs::write(target.join("Vintagestory.exe"), b"game").unwrap();
        let profile = serde_json::json!({
            "schema": 1,
            "id": "vs-1.22.7-win-x64",
            "gameVersion": "1.22.7",
            "runtimeMajor": 10,
            "files": { "Vintagestory.exe": sha_of(b"game") },
        });
        fs::write(
            target.join("VulkanStory/managed/profiles/vs-1.22.7-win-x64.json"),
            profile.to_string(),
        )
        .unwrap();

        let package = package_for(&[]);
        verify_official_files(&target, &package).unwrap();

        fs::write(target.join("Vintagestory.exe"), b"modded").unwrap();
        let error = verify_official_files(&target, &package).unwrap_err();
        assert_eq!(error.name, "vulkanstory_official_mismatch");

        fs::remove_file(target.join("Vintagestory.exe")).unwrap();
        let error = verify_official_files(&target, &package).unwrap_err();
        assert_eq!(error.name, "vulkanstory_official_mismatch");
    }

    /// Exercises the real published release end to end: latest-tag redirect,
    /// `archives.json`, and the package inventory read straight out of the
    /// remote archive over range requests. Network-dependent, so ignored by
    /// default; run with `cargo test vulkanstory::tests::real -- --ignored`.
    #[tokio::test]
    #[ignore = "network"]
    async fn real_package_reads_and_validates() {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .user_agent("StoryForge/test")
            .build()
            .unwrap();
        let tag = fetch_latest_tag(&client)
            .await
            .expect("the latest release tag should resolve");
        let (filename, sha256) = fetch_archive_entry(&client, &tag, "win-x64")
            .await
            .expect("archives.json should name the win-x64 package");
        assert_eq!(filename, "VulkanStory-win-x64.zip");
        assert_eq!(sha256.len(), 64);

        let url = archive_url(&tag, &filename);
        let bytes = read_remote_zip_entry(&client, &url, PACKAGE_JSON_PATH, MAX_PACKAGE_BYTES)
            .await
            .expect("the package inventory should read over range requests");
        let text = String::from_utf8(bytes).unwrap();
        let package = parse_package_json(&text).expect("the real inventory should parse");
        assert_eq!(package.rid, "win-x64");
        assert_eq!(
            package.profile,
            format!("vs-{}-win-x64", package.game_version)
        );
        assert!(package.files.len() > 10);
        assert!(package.files.contains_key("hostfxr.dll"));
    }
}
