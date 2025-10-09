use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

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
