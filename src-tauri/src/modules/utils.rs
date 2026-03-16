use fs_extra::dir::{copy, CopyOptions};
use std::{
    fs::{remove_dir_all, rename},
    path::PathBuf,
};
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

pub fn versions_subdir(app: AppHandle) -> String {
    app.zustand()
        .get::<String>("settings", "versionsSubdir")
        .unwrap_or_else(|_| "versions".to_string())
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

pub fn installations_subdir(app: AppHandle) -> String {
    app.zustand()
        .get::<String>("settings", "installationsSubdir")
        .unwrap_or_else(|_| "installations".to_string())
}

#[tauri::command]
pub async fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

pub fn move_folder(source_path: PathBuf, destination_path: PathBuf) -> Result<String, UiError> {
    if !source_path.exists() || !source_path.is_dir() {
        return Ok("source_not_exist".into());
    }

    match rename(&source_path, &destination_path) {
        Ok(_) => return Ok("renamed".into()),
        Err(_) => {
            let mut options = CopyOptions::new();
            options.overwrite = true;
            options.copy_inside = false;
            copy(&source_path, destination_path.parent().unwrap(), &options).map_err(|e| {
                UiError {
                    name: "move_failed".into(),
                    message: format!("Failed to move directory: {e}"),
                }
            })?;
            remove_dir_all(&source_path).map_err(|e| UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove source directory after move: {e}"),
            })?;
        }
    }

    Ok("moved".into())
}
