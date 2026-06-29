use serde::Serialize;
use std::{
    fs::{read_dir, remove_dir_all},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, State};

use crate::modules::utils::{dir_size, format_size, move_folder};

use super::errors::UiError;
use super::utils::{versions_folder, versions_subdir};
use crate::{log_error, log_info};

/// A version is incomplete (not fully installed) if its directory contains any sign
/// of an in-progress or interrupted download: a `.resume.json` manifest or an
/// archive file (`.tar.gz`, `.zip`) that hasn't been extracted yet.
fn is_incomplete(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|e| {
                let p: PathBuf = e.path();
                let name = p.to_string_lossy().to_string();
                name.ends_with(".resume.json")
                    || name.ends_with(".tar.gz")
                    || name.ends_with(".zip")
            })
        })
        .unwrap_or(false)
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
        if entry.path().is_dir() && !is_incomplete(&entry.path()) {
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
pub async fn fetch_versions(
    client: State<'_, Arc<reqwest::Client>>,
) -> Result<Vec<String>, UiError> {
    let res = client
        .get("https://vsapi.betterjs.dev/versions")
        .send()
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
    let src = PathBuf::from(&source).join(&subdir);
    let dst = PathBuf::from(&destination).join(&subdir);
    log_info!("move_versions_folder: {:?} -> {:?}", src, dst);
    move_folder(src, dst)?;
    log_info!("move_versions_folder: done");
    Ok("moved".into())
}

#[command]
pub async fn remove_all_versions(source: String, subdir: String) -> Result<String, UiError> {
    let source_path = PathBuf::from(source).join(&subdir);

    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }

    log_info!("remove_all_versions: {:?}", source_path);
    remove_dir_all(&source_path).map_err(|e| {
        log_error!("remove_all_versions: remove_dir_all failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove versions directory: {e}"),
        }
    })?;

    Ok("removed".into())
}
