use std::{
    fs::{read_dir, remove_dir_all},
    path::PathBuf,
};
use tauri::{command, AppHandle};

use crate::modules::utils::move_folder;

use super::errors::UiError;
use super::utils::{versions_folder, versions_subdir};

#[command]
pub fn get_installed_versions(app: AppHandle) -> Result<Vec<String>, UiError> {
    // Should look up the versions folder and return a list of installed versions
    let base_dir = versions_folder(app.clone());
    let subdir = versions_subdir(app.clone());
    let versions_dir = base_dir.join(&subdir);
    if !versions_dir.exists() || !versions_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut versions = vec![];
    for entry in read_dir(versions_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read versions directory: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read directory entry: {e}"),
        })?;
        if entry.path().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                versions.push(name.to_string());
            }
        }
    }
    Ok(versions)
}

#[command]
pub fn remove_installed_version(version: String, app: AppHandle) -> Result<String, UiError> {
    let subdir = versions_subdir(app.clone());
    let versions_path = versions_folder(app.clone()).join(&subdir).join(&version);
    if !versions_path.exists() || !versions_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                versions_path.to_string_lossy()
            ),
        });
    }
    remove_dir_all(&versions_path).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove version directory: {e}"),
    })?;
    Ok("removed".into())
}

#[command]
pub async fn fetch_versions() -> Result<Vec<String>, UiError> {
    let res = reqwest::get("https://vsapi.betterjs.dev/versions")
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<Vec<String>>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;

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

    remove_dir_all(&source_path).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove versions directory: {e}"),
    })?;

    Ok("removed".into())
}
