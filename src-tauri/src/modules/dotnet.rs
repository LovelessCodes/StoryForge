use reqwest::get;
use serde::Deserialize;
use serde_json::json;
use std::{
    fs::create_dir_all,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter};

use super::errors::UiError;
use crate::{log_debug, log_info};

/// Map Vintage Story game version to .NET runtime channel.
/// VS >= 1.22.x → "10.0", VS 1.21.x → "8.0", older → "7.0"
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
/// On Apple Silicon (arm64), system dotnet may be arm64-only while Vintage Story
/// needs x86_64 — in that case we only check explicit DOTNET_ROOT and Homebrew x64 path.
pub fn find_system_dotnet_root(channel: &str) -> Option<PathBuf> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return find_system_dotnet_root_macos_arm64(channel);

    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    find_system_dotnet_root_default(channel)
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn find_system_dotnet_root_macos_arm64(_channel: &str) -> Option<PathBuf> {
    // Never trust system dotnet on Apple Silicon — it's arm64.
    // Vintage Story is x86_64, needs x64 runtime. Always download.
    // The download is cached, so only slow on first launch per channel.
    None
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn find_system_dotnet_root_default(channel: &str) -> Option<PathBuf> {
    // 1. Check DOTNET_ROOT environment variable
    if let Ok(root) = std::env::var("DOTNET_ROOT") {
        let p = PathBuf::from(&root);
        if has_runtime(&p, channel) {
            return Some(p);
        }
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
            return Some(p);
        }
    }

    // 3. Try `which dotnet` and resolve its parent directory
    if let Ok(dotnet_exe) = which::which("dotnet") {
        if let Some(parent) = dotnet_exe.parent() {
            if has_runtime(parent, channel) {
                return Some(parent.to_path_buf());
            }
            // Some installs put dotnet in a subdir; try parent of parent
            if let Some(grandparent) = parent.parent() {
                if has_runtime(grandparent, channel) {
                    return Some(grandparent.to_path_buf());
                }
            }
        }
    }

    None
}

#[derive(Debug, Deserialize)]
struct ReleaseIndex {
    #[serde(rename = "latest-runtime")]
    latest_runtime: String,
}

/// Resolve the latest patch version for a given channel (e.g. "7.0" → "7.0.20")
async fn resolve_dotnet_version(channel: &str) -> Result<String, UiError> {
    let url = format!(
        "https://dotnetcli.azureedge.net/dotnet/release-metadata/{}/releases.json",
        channel
    );
    let resp = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Failed to fetch dotnet releases: {e}")))?;
    if !resp.status().is_success() {
        return Err(UiError::from(format!(
            "Failed to fetch dotnet releases: HTTP {}",
            resp.status()
        )));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| UiError::from(format!("Failed to read dotnet releases body: {e}")))?;
    let release_index: ReleaseIndex = serde_json::from_str(&text)
        .map_err(|e| UiError::from(format!("Failed to parse dotnet releases: {e}")))?;
    Ok(release_index.latest_runtime)
}

fn download_url(version: &str) -> String {
    let platform = if cfg!(target_os = "windows") {
        "win"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    let ext = if cfg!(target_os = "windows") {
        "zip"
    } else {
        "tar.gz"
    };
    format!(
        "https://dotnetcli.azureedge.net/dotnet/Runtime/{version}/dotnet-runtime-{version}-{platform}-x64.{ext}"
    )
}

/// Download and extract the .NET runtime to `dest_dir`.
/// Emits `dotnet-download-{id}` events for progress.
/// Returns the path to the extracted runtime root.
async fn download_dotnet_runtime(
    app: &AppHandle,
    version: &str,
    dest_dir: &Path,
    event_id: u64,
) -> Result<PathBuf, UiError> {
    create_dir_all(dest_dir).map_err(|e| UiError {
        name: "create_dir_failed".into(),
        message: format!("Failed to create dotnet dir: {e}"),
    })?;

    let url = download_url(version);
    log_debug!("[dotnet] downloading {} ...", url);

    let event_name = format!("dotnet-download-{}", event_id);
    let _ = app.emit(&event_name, json!({"phase": "downloading", "percent": 0.0}));

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::from(format!("Failed to download dotnet runtime: {e}")))?;

    if !resp.status().is_success() {
        return Err(UiError::from(format!(
            "Failed to download dotnet runtime: HTTP {}",
            resp.status()
        )));
    }

    let total_size = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut buf = Vec::new();
    let mut stream = resp.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| UiError::from(format!("Download error: {e}")))?;
        buf.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;
        if total_size > 0 {
            let percent = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = app.emit(
                &event_name,
                json!({"phase": "downloading", "percent": percent.round() }),
            );
        }
    }

    let _ = app.emit(
        &event_name,
        json!({"phase": "extracting", "percent": 100.0}),
    );

    let bytes = buf;

    #[cfg(not(target_os = "windows"))]
    {
        // tar.gz
        let cursor = std::io::Cursor::new(&bytes);
        let gz = flate2::read::GzDecoder::new(cursor);
        let mut archive = tar::Archive::new(gz);
        archive
            .unpack(dest_dir)
            .map_err(|e| UiError::from(format!("Failed to extract dotnet runtime: {e}")))?;
    }

    #[cfg(target_os = "windows")]
    {
        // zip
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| UiError::from(format!("Failed to open dotnet zip: {e}")))?;
        archive
            .extract(dest_dir)
            .map_err(|e| UiError::from(format!("Failed to extract dotnet runtime: {e}")))?;
    }

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
) -> Result<PathBuf, UiError> {
    let channel = dotnet_channel(game_version);

    // 1. Try system installation
    if let Some(root) = find_system_dotnet_root(channel) {
        log_info!("[dotnet] found system dotnet at {:?}", root);
        return Ok(root);
    }

    // 2. Check if we already downloaded it
    let local_dir = app_data_dir.join("dotnet").join(channel);
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
    let version = resolve_dotnet_version(channel).await?;
    log_info!("[dotnet] resolved to version {}", version);
    let root = download_dotnet_runtime(app, &version, &local_dir, installation_id).await?;
    log_info!("[dotnet] installed to {:?}", root);
    Ok(root)
}
