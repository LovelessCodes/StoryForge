//! One-time data migrations run at application startup.
//!
//! Migrations are read-only / move-only and should be idempotent so they can
//! safely run every time the app starts.

use std::fs::{read_to_string, remove_file, write};
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::auth::SavedAccount;
use super::installations::{write_installation_json, InstallationInfo};
use crate::log_info;

/// Run all data migrations.
///
/// Called once during app setup, before other modules load user data.
pub fn run_all(app: &AppHandle) {
    log_info!("migrations: running all migrations");
    migrate_installations_from_zustand(app);
    migrate_accounts_from_zustand(app);
    log_info!("migrations: done");
}

/// Migrate installations stored in the old zustand store to `installation.json`.
fn migrate_installations_from_zustand(app: &AppHandle) {
    use tauri_plugin_zustand::ManagerExt;

    let Ok(old_raw) = app.zustand().get::<Value>("installations", "installations") else {
        return;
    };
    let Some(old_arr) = old_raw.as_array() else {
        return;
    };

    for old_inst in old_arr {
        let old_path_str = old_inst["path"].as_str().unwrap_or("");
        if old_path_str.is_empty() {
            continue;
        }
        let old_pb = PathBuf::from(old_path_str);
        if !old_pb.is_dir() {
            continue;
        }
        let inst_json = super::paths::installation_json_path(&old_pb);
        if inst_json.exists() {
            continue;
        }
        let info = InstallationInfo {
            name: old_inst["name"].as_str().unwrap_or("").to_string(),
            version: old_inst["version"].as_str().unwrap_or("").to_string(),
            start_params: old_inst["startParams"].as_str().unwrap_or("").to_string(),
            favorite: false,
            icon: None,
            last_played: None,
            total_time_played: 0,
            modpack_slug: None,
            modpack_version: None,
            env_vars: std::collections::HashMap::new(),
        };
        let _ = write_installation_json(&old_pb, &info);
    }
}

/// Migrate accounts stored in the old zustand store to `accounts.json`.
fn migrate_accounts_from_zustand(app: &AppHandle) {
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            log_info!("migrations: skipping account migration, cannot get app data dir: {e}");
            return;
        }
    };

    let new_path = data_dir.join("accounts.json");
    if new_path.exists() {
        return;
    }

    let old_path = data_dir.join("store").join("accounts.json");
    if !old_path.exists() {
        return;
    }

    let Ok(old_json) = read_to_string(&old_path) else {
        return;
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&old_json) else {
        return;
    };
    let Some(users) = parsed
        .get("users")
        .and_then(|u| serde_json::from_value::<Vec<SavedAccount>>(u.clone()).ok())
    else {
        return;
    };

    let Ok(json) = serde_json::to_string_pretty(&users) else {
        return;
    };
    if write(&new_path, &json).is_ok() {
        let _ = remove_file(&old_path);
    }
}
