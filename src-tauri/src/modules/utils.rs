use fs_extra::dir::{copy, CopyOptions};
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
    data_dir
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
    data_dir
}

pub fn move_folder(source_path: PathBuf, destination_path: PathBuf) -> Result<bool, UiError> {
    if !destination_path.exists() {
        std::fs::create_dir_all(&destination_path).map_err(|e| UiError {
            name: "create_failed".into(),
            message: format!("Failed to create destination directory: {e}"),
        })?;
    }

    if !source_path.exists() || !source_path.is_dir() {
        return Ok(false);
    }

    match std::fs::rename(&source_path, &destination_path) {
        Ok(_) => return Ok(true),
        Err(_) => {
            let mut options = CopyOptions::new();
            options.overwrite = true;
            options.copy_inside = false;
            let dst_parent = destination_path.parent().unwrap();
            copy(&source_path, dst_parent, &options).map_err(|e| UiError {
                name: "move_failed".into(),
                message: format!("Failed to move directory: {e}"),
            })?;
            std::fs::remove_dir_all(&source_path).map_err(|e| UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove source directory after move: {e}"),
            })?;
        }
    }

    Ok(true)
}
