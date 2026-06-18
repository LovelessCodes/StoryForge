use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;
use std::{
    fs::{self, create_dir_all, File},
    io::{BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, Manager};

use super::errors::UiError;
use super::utils::is_at_least_1_22_3;
use crate::{log_debug, log_error, log_info};

/// Map Vintage Story game version to .NET runtime channel.
/// VS >= 1.22.x -> "10.0", VS 1.21.x -> "8.0", older -> "7.0"
fn dotnet_channel(game_version: &str) -> &str {
    let parts: Vec<u32> = game_version
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();
    let minor = parts.get(1).copied().unwrap_or(0);
    if minor >= 22 {
        "10.0"
    } else if minor == 21 {
        "8.0"
    } else {
        "7.0"
    }
}

/// On macOS arm64, verify a dotnet root actually contains ARM64-native binaries
/// by reading the Mach-O header of libhostfxr. Returns false for x64-only installs.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn is_dotnet_arm64(root: &Path) -> bool {
    // Find a hostfxr version dir
    let fxr_dir = root.join("host").join("fxr");
    let version_dir = match std::fs::read_dir(&fxr_dir) {
        Ok(entries) => entries
            .flatten()
            .find(|e| e.path().is_dir())
            .map(|e| e.path()),
        Err(_) => return false,
    };
    let version_dir = match version_dir {
        Some(d) => d,
        None => return false,
    };

    let hostfxr = version_dir.join("libhostfxr.dylib");
    let mut file = match std::fs::File::open(&hostfxr) {
        Ok(f) => f,
        Err(e) => {
            log_debug!("[dotnet] arm64_check: can't open {:?}: {}", hostfxr, e);
            return false;
        }
    };

    let mut magic = [0u8; 4];
    if file.read_exact(&mut magic).is_err() {
        return false;
    }

    // Mach-O fat binary magic: 0xCAFEBABE (big-endian) or 0xBEBAFECA (little-endian)
    let fat_be = u32::from_be_bytes(magic);
    let fat_le = u32::from_le_bytes(magic);
    if fat_be == 0xCAFEBABE || fat_le == 0xCAFEBABE {
        log_debug!(
            "[dotnet] arm64_check: {:?} is a fat (universal) binary",
            hostfxr
        );
        return true; // universal — supports arm64
    }

    // Single-arch 64-bit Mach-O: magic is 0xFEEDFACF (or byte-swapped 0xCFFAEDFE)
    // CPU type follows at offset 4 (little-endian u32)
    let macho64 = u32::from_be_bytes(magic);
    if macho64 != 0xFEEDFACF && macho64 != 0xCFFAEDFE {
        log_debug!(
            "[dotnet] arm64_check: {:?} magic={:#x} — not Mach-O",
            hostfxr,
            macho64
        );
        return false;
    }

    let mut cpu_type = [0u8; 4];
    if file.read_exact(&mut cpu_type).is_err() {
        return false;
    }
    let cpu = u32::from_le_bytes(cpu_type);
    // CPU_TYPE_ARM64 = 0x0100000C, CPU_TYPE_X86_64 = 0x01000007
    let is_arm = cpu == 0x0100000C;
    log_debug!(
        "[dotnet] arm64_check: {:?} cpu_type={:#x} is_arm64={}",
        hostfxr,
        cpu,
        is_arm
    );
    is_arm
}

/// On macOS arm64, check that a dotnet root passes both the runtime check
/// AND the architecture check (real ARM64, not x64).
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn has_runtime_arm64(root: &Path, channel: &str) -> bool {
    if !has_runtime(root, channel) {
        return false;
    }
    if !is_dotnet_arm64(root) {
        log_debug!(
            "[dotnet] system_arm64: {:?} has runtime but is x64 (not arm64), skipping",
            root
        );
        return false;
    }
    true
}

/// Check if the shared runtime for `channel` exists at the given root.
/// Excludes preview versions — they don't satisfy stable framework references.
fn has_runtime(root: &Path, channel: &str) -> bool {
    let shared_dir = root.join("shared").join("Microsoft.NETCore.App");
    if !shared_dir.is_dir() {
        return false;
    }
    let prefix = format!("{}.", channel);
    if let Ok(entries) = std::fs::read_dir(&shared_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Must start with "10.0." and NOT be a preview
            if name.starts_with(&prefix) && !name.contains("preview") && entry.path().is_dir() {
                return true;
            }
        }
    }
    false
}

/// Try to find an existing system dotnet installation with the required runtime.
/// On macOS aarch64, delegates to the arm64-specific check which handles
/// dotnet 10 (ARM64-native) vs dotnet 8/7 (x64-only via Rosetta).
pub fn find_system_dotnet_root(channel: &str) -> Option<PathBuf> {
    log_debug!("[dotnet] find_system: channel={}", channel);

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        let result = find_system_dotnet_root_macos_arm64(channel);
        if result.is_some() {
            log_info!(
                "[dotnet] find_system: found arm64 system dotnet at {:?}",
                result
            );
        } else {
            log_debug!("[dotnet] find_system: no arm64 system dotnet found");
        }
        return result;
    }

    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    {
        let result = find_system_dotnet_root_default(channel);
        if result.is_some() {
            log_info!("[dotnet] find_system: found system dotnet at {:?}", result);
        } else {
            log_debug!("[dotnet] find_system: no system dotnet found");
        }
        result
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn find_system_dotnet_root_macos_arm64(channel: &str) -> Option<PathBuf> {
    // dotnet 10 supports ARM64 natively — look for system dotnet.
    // dotnet 8 and 7 are x64-only on macOS; still need Rosetta, so skip.
    if channel != "10.0" {
        log_debug!(
            "[dotnet] system_arm64: channel={} ≠ 10.0, skipping system dotnet",
            channel
        );
        return None;
    }

    // 1. Check DOTNET_ROOT environment variable
    if let Ok(root) = std::env::var("DOTNET_ROOT") {
        let p = PathBuf::from(&root);
        if has_runtime_arm64(&p, channel) {
            log_info!("[dotnet] system_arm64: found via DOTNET_ROOT={:?}", p);
            return Some(p);
        }
        log_debug!(
            "[dotnet] system_arm64: DOTNET_ROOT={:?} has no matching runtime",
            p
        );
    }

    // 2. Check common ARM64 dotnet install paths
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let common_paths = [
        format!("{}/.dotnet", home),
        "/opt/homebrew/opt/dotnet/libexec".into(),
        "/usr/local/share/dotnet".into(),
    ];

    for path_str in &common_paths {
        let p = PathBuf::from(path_str);
        if has_runtime_arm64(&p, channel) {
            log_info!("[dotnet] system_arm64: found at common path {:?}", p);
            return Some(p);
        }
    }

    // 3. Try `which dotnet`
    if let Ok(dotnet_exe) = which::which("dotnet") {
        log_debug!("[dotnet] system_arm64: which dotnet → {:?}", dotnet_exe);
        if let Some(parent) = dotnet_exe.parent() {
            if has_runtime_arm64(parent, channel) {
                log_info!(
                    "[dotnet] system_arm64: found via which → parent {:?}",
                    parent
                );
                return Some(parent.to_path_buf());
            }
            if let Some(grandparent) = parent.parent() {
                if has_runtime_arm64(grandparent, channel) {
                    log_info!(
                        "[dotnet] system_arm64: found via which → grandparent {:?}",
                        grandparent
                    );
                    return Some(grandparent.to_path_buf());
                }
            }
        }
    }

    log_debug!("[dotnet] system_arm64: no system dotnet found");
    None
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn find_system_dotnet_root_default(channel: &str) -> Option<PathBuf> {
    // 1. Check DOTNET_ROOT environment variable
    if let Ok(root) = std::env::var("DOTNET_ROOT") {
        let p = PathBuf::from(&root);
        if has_runtime(&p, channel) {
            log_info!("[dotnet] system_default: found via DOTNET_ROOT={:?}", p);
            return Some(p);
        }
        log_debug!(
            "[dotnet] system_default: DOTNET_ROOT={:?} has no matching runtime",
            p
        );
    }

    // 2. Check common installation paths
    #[cfg(target_os = "macos")]
    let common_paths = [
        "/usr/local/share/dotnet",
        "/opt/homebrew/opt/dotnet/libexec",
        &format!(
            "{}/.dotnet",
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        ),
    ];

    #[cfg(target_os = "linux")]
    let common_paths = [
        "/usr/share/dotnet",
        "/usr/lib/dotnet",
        &format!(
            "{}/.dotnet",
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        ),
    ];

    #[cfg(target_os = "windows")]
    let common_paths = [
        &format!(
            "{}\\dotnet",
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into())
        ),
        &format!(
            "{}\\dotnet",
            std::env::var("LOCALAPPDATA")
                .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".into())
        ),
    ];

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    let common_paths: [&str; 0] = [];

    for path_str in &common_paths {
        let p = PathBuf::from(path_str);
        if has_runtime(&p, channel) {
            log_info!("[dotnet] system_default: found at common path {:?}", p);
            return Some(p);
        }
    }

    // 3. Try `which dotnet` and resolve its parent directory
    if let Ok(dotnet_exe) = which::which("dotnet") {
        log_debug!("[dotnet] system_default: which dotnet → {:?}", dotnet_exe);
        if let Some(parent) = dotnet_exe.parent() {
            if has_runtime(parent, channel) {
                log_info!(
                    "[dotnet] system_default: found via which → parent {:?}",
                    parent
                );
                return Some(parent.to_path_buf());
            }
            // Some installs put dotnet in a subdir; try parent of parent
            if let Some(grandparent) = parent.parent() {
                if has_runtime(grandparent, channel) {
                    log_info!(
                        "[dotnet] system_default: found via which → grandparent {:?}",
                        grandparent
                    );
                    return Some(grandparent.to_path_buf());
                }
            }
        }
    }

    log_debug!("[dotnet] system_default: no system dotnet found");
    None
}

#[derive(Debug, Deserialize)]
struct ReleaseIndex {
    #[serde(rename = "latest-runtime")]
    latest_runtime: String,
}

/// Resolve the latest patch version for a given channel (e.g. "7.0" -> "7.0.20")
async fn resolve_dotnet_version(client: &Client, channel: &str) -> Result<String, UiError> {
    let url = format!(
        "https://dotnetcli.azureedge.net/dotnet/release-metadata/{}/releases.json",
        channel
    );
    let resp = client.get(&url).send().await.map_err(|e| {
        log_error!("dotnet: Failed to fetch dotnet releases: {e}");
        UiError::from(format!("Failed to fetch dotnet releases: {e}"))
    })?;
    if !resp.status().is_success() {
        return Err(UiError::from(format!(
            "Failed to fetch dotnet releases: HTTP {}",
            resp.status()
        )));
    }
    let text = resp.text().await.map_err(|e| {
        log_error!("dotnet: Failed to read dotnet releases body: {e}");
        UiError::from(format!("Failed to read dotnet releases body: {e}"))
    })?;
    let release_index: ReleaseIndex = serde_json::from_str(&text).map_err(|e| {
        log_error!("dotnet: Failed to parse dotnet releases: {e}");
        UiError::from(format!("Failed to parse dotnet releases: {e}"))
    })?;
    Ok(release_index.latest_runtime)
}

/// Determine which architecture's dotnet runtime to use for a given game version.
/// On macOS aarch64, VS >= 1.22.3 supports ARM64-native dotnet; older versions need x64.
fn runtime_arch(game_version: &str) -> &str {
    let is_macos_arm = cfg!(all(target_os = "macos", target_arch = "aarch64"));
    let at_least = is_at_least_1_22_3(game_version).unwrap_or(false);
    let arch = if is_macos_arm && at_least {
        "arm64"
    } else {
        "x64"
    };
    log_debug!(
        "[dotnet] runtime_arch: game={} macos_arm={} at_least_1_22_3={} -> arch={}",
        game_version,
        is_macos_arm,
        at_least,
        arch
    );
    arch
}

fn download_url(version: &str, arch: &str) -> String {
    let platform = if cfg!(target_os = "windows") {
        format!("win-{}", arch)
    } else if cfg!(target_os = "macos") {
        format!("osx-{}", arch)
    } else {
        format!("linux-{}", arch)
    };

    let ext = if cfg!(target_os = "windows") {
        "zip"
    } else {
        "tar.gz"
    };
    format!(
        "https://dotnetcli.azureedge.net/dotnet/Runtime/{version}/dotnet-runtime-{version}-{platform}.{ext}"
    )
}

/// Extract the downloaded archive into `dest_dir`. Runs on a blocking pool.
async fn extract_archive(archive: &Path, dest_dir: &Path) -> Result<(), UiError> {
    let archive = archive.to_path_buf();
    let dest_dir = dest_dir.to_path_buf();

    tokio::task::spawn_blocking(move || {
        if archive.extension().and_then(|e| e.to_str()) == Some("zip") {
            let file = File::open(&archive)
                .map_err(|e| UiError::from(format!("Failed to open dotnet zip: {e}")))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| UiError::from(format!("Failed to open dotnet zip: {e}")))?;
            archive
                .extract(&dest_dir)
                .map_err(|e| UiError::from(format!("Failed to extract dotnet runtime: {e}")))?;
        } else {
            let file = File::open(&archive)
                .map_err(|e| UiError::from(format!("Failed to open dotnet tar: {e}")))?;
            let reader = BufReader::new(file);
            let gz = flate2::read::GzDecoder::new(reader);
            let mut archive = tar::Archive::new(gz);
            archive
                .unpack(&dest_dir)
                .map_err(|e| UiError::from(format!("Failed to extract dotnet runtime: {e}")))?;
        }
        Ok::<(), UiError>(())
    })
    .await
    .map_err(|e| UiError::from(format!("spawn blocking error: {e}")))?
}

/// Download and extract the .NET runtime to `dest_dir`.
/// Emits `dotnet-download-{id}` events for progress.
/// Returns the path to the extracted runtime root.
async fn download_dotnet_runtime(
    client: &Client,
    app: &AppHandle,
    version: &str,
    dest_dir: &Path,
    event_id: u64,
    arch: &str,
) -> Result<PathBuf, UiError> {
    create_dir_all(dest_dir).map_err(|e| {
        log_error!("dotnet: create_dir_failed: {e}");
        UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create dotnet dir: {e}"),
        }
    })?;

    let url = download_url(version, arch);
    log_debug!("[dotnet] downloading {} ...", url);

    let event_name = format!("dotnet-download-{}", event_id);
    let _ = app.emit(&event_name, json!({"phase": "downloading", "percent": 0.0}));

    let resp = client.get(&url).send().await.map_err(|e| {
        log_error!("dotnet: Failed to download dotnet runtime: {e}");
        UiError::from(format!("Failed to download dotnet runtime: {e}"))
    })?;

    if !resp.status().is_success() {
        return Err(UiError::from(format!(
            "Failed to download dotnet runtime: HTTP {}",
            resp.status()
        )));
    }

    let total_size = resp.content_length().unwrap_or(0);
    let archive_path = dest_dir.join(format!("dotnet-runtime-{}.tmp", version));
    let mut file = File::create(&archive_path)
        .map_err(|e| UiError::from(format!("Failed to create dotnet archive temp file: {e}")))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            log_error!("dotnet: Download error: {e}");
            UiError::from(format!("Download error: {e}"))
        })?;
        file.write_all(&chunk)
            .map_err(|e| UiError::from(format!("Failed to write dotnet archive: {e}")))?;
        downloaded += chunk.len() as u64;
        if total_size > 0 {
            let percent = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = app.emit(
                &event_name,
                json!({"phase": "downloading", "percent": percent.round() }),
            );
        }
    }
    drop(file);

    if total_size > 0 {
        let actual = fs::metadata(&archive_path)
            .map(|m| m.len())
            .unwrap_or(downloaded);
        if actual != total_size {
            return Err(UiError::from(format!(
                "dotnet download size mismatch: expected {total_size} bytes, got {actual} bytes"
            )));
        }
    }

    let _ = app.emit(
        &event_name,
        json!({"phase": "extracting", "percent": 100.0}),
    );

    extract_archive(&archive_path, dest_dir).await?;

    fs::remove_file(&archive_path).ok();

    // The tarball/zip contains a top-level directory like "dotnet-runtime-7.0.20-osx-x64/"
    // Find it and return its path
    let mut found = None;
    if let Ok(entries) = std::fs::read_dir(dest_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir()
                && p.file_name()
                    .map(|n| n.to_string_lossy().starts_with("dotnet-runtime-"))
                    .unwrap_or(false)
            {
                found = Some(p);
                break;
            }
        }
    }
    let result = found.unwrap_or_else(|| dest_dir.to_path_buf());

    let _ = app.emit(&event_name, json!({"phase": "done", "percent": 100.0}));
    Ok(result)
}

/// Ensure .NET runtime is available for the given game version.
/// Returns the DOTNET_ROOT path to set for the game process.
pub async fn ensure_dotnet(
    app: &AppHandle,
    app_data_dir: &Path,
    game_version: &str,
    installation_id: u64,
    use_system_dotnet: bool,
) -> Result<PathBuf, UiError> {
    let channel = dotnet_channel(game_version);

    // 1. Try system installation (if enabled)
    if use_system_dotnet {
        if let Some(root) = find_system_dotnet_root(channel) {
            log_info!("[dotnet] found system dotnet at {:?}", root);
            return Ok(root);
        }
    } else {
        log_info!("[dotnet] system dotnet check disabled by user setting, using app dotnet");
    }

    // 2. Check if we already downloaded it
    // x64 runtimes use the plain channel dir (backward-compatible).
    // arm64 runtimes use {channel}-arm64 to avoid colliding with existing x64 caches.
    let arch = runtime_arch(game_version);
    let local_dir = if arch == "arm64" {
        app_data_dir
            .join("dotnet")
            .join(format!("{}-arm64", channel))
    } else {
        app_data_dir.join("dotnet").join(channel)
    };
    log_info!(
        "[dotnet] ensure: game={} channel={} runtime_arch={} cache_dir={:?}",
        game_version,
        channel,
        arch,
        local_dir
    );
    if has_runtime(&local_dir, channel) {
        log_info!("[dotnet] using cached dotnet at {:?}", local_dir);
        return Ok(local_dir);
    }

    // Also check if extracted into a versioned subdir
    if let Ok(entries) = std::fs::read_dir(&local_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && has_runtime(&p, channel) {
                log_info!("[dotnet] using cached dotnet at {:?}", p);
                return Ok(p);
            }
        }
    }

    // 3. Download
    log_info!(
        "[dotnet] downloading dotnet {} for game version {} ...",
        channel,
        game_version
    );
    let client: Arc<Client> = app.state::<Arc<Client>>().inner().clone();
    let version = resolve_dotnet_version(&client, channel).await?;
    log_info!("[dotnet] resolved to version {}", version);
    let arch = runtime_arch(game_version);
    let root =
        download_dotnet_runtime(&client, app, &version, &local_dir, installation_id, arch).await?;
    log_info!("[dotnet] installed to {:?}", root);
    Ok(root)
}
