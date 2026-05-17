use serde::Serialize;
use std::{
    fs::{read_dir, remove_dir_all},
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle};

use crate::modules::utils::move_folder;

use super::errors::UiError;
use super::utils::{versions_folder, versions_subdir};
use crate::{log_error, log_info};

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn dir_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                total += dir_size(&path);
            } else if let Ok(meta) = path.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
}

#[command]
pub fn get_installed_versions(app: AppHandle) -> Result<Vec<VersionInfo>, UiError> {
    log_info!("get_installed_versions");
    // Should look up the versions folder and return a list of installed versions
    let base_dir = versions_folder(app.clone());
    let subdir = versions_subdir(app.clone());
    let versions_dir = base_dir.join(&subdir);
    if !versions_dir.exists() || !versions_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut versions = vec![];
    for entry in read_dir(versions_dir).map_err(|e| {
        log_error!("get_installed_versions: read_dir failed: {e}");
        UiError {
            name: "io_error".into(),
            message: format!("Failed to read versions directory: {e}"),
        }
    })? {
        let entry = entry.map_err(|e| {
            log_error!("get_installed_versions: dir entry error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            }
        })?;
        if entry.path().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                let path = entry.path();
                let size_bytes = dir_size(&path);
                versions.push(VersionInfo {
                    name: name.to_string(),
                    size_bytes,
                    size_display: format_size(size_bytes),
                });
            }
        }
    }
    Ok(versions)
}

#[command]
pub fn remove_installed_version(version: String, app: AppHandle) -> Result<String, UiError> {
    log_info!("remove_installed_version: {}", version);
    let subdir = versions_subdir(app.clone());
    let versions_path = versions_folder(app.clone()).join(&subdir).join(&version);
    if !versions_path.exists() || !versions_path.is_dir() {
        log_error!("remove_installed_version: not found: {:?}", versions_path);
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                versions_path.to_string_lossy()
            ),
        });
    }
    remove_dir_all(&versions_path).map_err(|e| {
        log_error!("remove_installed_version: remove_dir_all failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove version directory: {e}"),
        }
    })?;
    Ok("removed".into())
}

#[command]
pub async fn fetch_versions() -> Result<Vec<String>, UiError> {
    let res = reqwest::get("https://vsapi.betterjs.dev/versions")
        .await
        .map_err(|e| {
            log_error!("fetch_versions: request failed: {e}");
            format!("Request error: {e}")
        })?;

    if !res.status().is_success() {
        log_error!("fetch_versions: HTTP {}", res.status());
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res.json::<Vec<String>>().await.map_err(|e| {
        log_error!("fetch_versions: JSON parse failed: {e}");
        format!("JSON error: {e}")
    })?;

    Ok(json)
}

#[command]
pub async fn move_versions_folder(
    source: String,
    destination: String,
    subdir: String,
) -> Result<String, UiError> {
    move_folder(
        PathBuf::from(source).join(&subdir),
        PathBuf::from(destination).join(&subdir),
    )?;
    Ok("moved".into())
}

#[command]
pub async fn remove_all_versions(source: String, subdir: String) -> Result<String, UiError> {
    let source_path = PathBuf::from(source).join(&subdir);

    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }

    remove_dir_all(&source_path).map_err(|e| {
        log_error!("remove_all_versions: remove_dir_all failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove versions directory: {e}"),
        }
    })?;

    Ok("removed".into())
}
