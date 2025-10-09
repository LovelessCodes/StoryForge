use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;

pub fn versions_folder(app: AppHandle) -> PathBuf {
    let version_parent: Option<String> = app
        .zustand()
        .get::<Option<String>>("settings", "versionsParent")
        .ok()
        .flatten();
    let data_dir = if let Some(vp) = version_parent {
        PathBuf::from(vp)
    } else {
        app.path().app_data_dir().unwrap()
    };
    return data_dir;
}

pub fn installations_folder(app: AppHandle) -> PathBuf {
    let installations_parent: Option<String> = app
        .zustand()
        .get::<Option<String>>("settings", "installationsParent")
        .ok()
        .flatten();
    let data_dir = if let Some(ip) = installations_parent {
        PathBuf::from(ip)
    } else {
        app.path().app_data_dir().unwrap()
    };
    return data_dir;
}

pub fn move_folder(source_path: PathBuf, destination_path: PathBuf) -> Result<bool, UiError> {
    if !destination_path.exists() || !destination_path.is_dir() {
        std::fs::create_dir_all(&destination_path).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!(
                "Failed to create destination directory: {}: {e}",
                destination_path.to_string_lossy()
            ),
        })?;
        for entry in std::fs::read_dir(&source_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read source directory: {e}"),
        })? {
            let entry = entry.map_err(|e| UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            })?;
            let dest_file_path = destination_path.join(entry.file_name());
            if entry.path().is_dir() {
                std::fs::create_dir_all(&dest_file_path).map_err(|e| UiError {
                    name: "create_dir_failed".into(),
                    message: format!(
                        "Failed to create directory: {}: {e}",
                        dest_file_path.to_string_lossy()
                    ),
                })?;
                std::fs::copy(&entry.path(), &dest_file_path).map_err(|e| UiError {
                    name: "copy_failed".into(),
                    message: format!(
                        "Failed to copy directory: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
                std::fs::remove_dir_all(&entry.path()).map_err(|e| UiError {
                    name: "remove_failed".into(),
                    message: format!(
                        "Failed to remove source directory: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
            } else {
                std::fs::copy(&entry.path(), &dest_file_path).map_err(|e| UiError {
                    name: "copy_failed".into(),
                    message: format!(
                        "Failed to copy file: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
                std::fs::remove_file(&entry.path()).map_err(|e| UiError {
                    name: "remove_failed".into(),
                    message: format!(
                        "Failed to remove source file: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
            }
        }
    } else {
        // Move the contents of source to destination
        for entry in std::fs::read_dir(&source_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read source directory: {e}"),
        })? {
            let entry = entry.map_err(|e| UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            })?;
            let dest_file_path = destination_path.join(entry.file_name());
            if entry.path().is_dir() {
                std::fs::create_dir_all(&dest_file_path).map_err(|e| UiError {
                    name: "create_dir_failed".into(),
                    message: format!(
                        "Failed to create directory: {}: {e}",
                        dest_file_path.to_string_lossy()
                    ),
                })?;
                std::fs::copy(&entry.path(), &dest_file_path).map_err(|e| UiError {
                    name: "copy_failed".into(),
                    message: format!(
                        "Failed to copy directory: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
                std::fs::remove_dir_all(&entry.path()).map_err(|e| UiError {
                    name: "remove_failed".into(),
                    message: format!(
                        "Failed to remove source directory: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
            } else {
                std::fs::copy(&entry.path(), &dest_file_path).map_err(|e| UiError {
                    name: "copy_failed".into(),
                    message: format!(
                        "Failed to copy file: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
                std::fs::remove_file(&entry.path()).map_err(|e| UiError {
                    name: "remove_failed".into(),
                    message: format!(
                        "Failed to remove source file: {}: {e}",
                        entry.path().to_string_lossy()
                    ),
                })?;
            }
        }
    }
    Ok(true)
}
