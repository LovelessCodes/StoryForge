//! One-time data migrations from the store-file era.
//!
//! Older Story Forge releases kept installations and accounts inside the
//! persisted zustand stores (`store/installations.json`, `store/accounts.json`)
//! before moving to `installation.json` manifests and `accounts.json`. A user
//! whose last run predates that move still has their data only in those store
//! files, and would arrive with no profiles and no accounts.
//!
//! These migrations write the file-based forms, so the normal legacy import
//! (which reads `installation.json`) and account loading pick them up. They are
//! read/copy-only and idempotent: safe to run at every startup.

use std::{
    fs::{read_to_string, remove_file, write},
    path::PathBuf,
};

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

use super::auth::SavedAccount;
use super::paths::{profile_json_path, STORE_DIR};
use super::profiles::ProfileInfo;
use crate::log_info;

/// Manifest the legacy import expects inside an installation folder.
const LEGACY_MANIFEST: &str = "installation.json";

/// Run every store-file migration. Called from the app setup, before any user
/// data is read.
pub fn run_all(app: &AppHandle) {
    log_info!("migrations: running all migrations");
    migrate_installations_from_zustand(app);
    migrate_accounts_from_zustand(app);
    log_info!("migrations: done");
}

/// Writes an `installation.json` for every installation the old zustand store
/// still holds, so the legacy import can convert it like any other folder.
fn migrate_installations_from_zustand(app: &AppHandle) {
    let Ok(old_raw) = app.zustand().get::<Value>("installations", "installations") else {
        return;
    };
    let Some(old_installations) = old_raw.as_array() else {
        return;
    };

    let mut written = 0usize;
    for old_installation in old_installations {
        let old_path = old_installation["path"].as_str().unwrap_or("");
        if old_path.is_empty() {
            continue;
        }
        let path = PathBuf::from(old_path);
        if !path.is_dir() {
            continue;
        }
        // Already converted (legacy manifest) or already a modern profile.
        if path.join(LEGACY_MANIFEST).is_file() || profile_json_path(&path).is_file() {
            continue;
        }
        let info = ProfileInfo {
            name: old_installation["name"].as_str().unwrap_or("").to_string(),
            version: old_installation["version"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            start_params: old_installation["startParams"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            ..Default::default()
        };
        let Ok(json) = serde_json::to_string_pretty(&info) else {
            continue;
        };
        if write(path.join(LEGACY_MANIFEST), json).is_ok() {
            written += 1;
        }
    }
    if written > 0 {
        log_info!("migrations: wrote {written} legacy installation manifest(s) from the old store");
    }
}

/// Moves accounts saved in the old zustand store file to `accounts.json`.
fn migrate_accounts_from_zustand(app: &AppHandle) {
    let Ok(data_dir) = app.path().app_data_dir() else {
        return;
    };

    let new_path = data_dir.join("accounts.json");
    if new_path.exists() {
        return;
    }

    let old_path = data_dir.join(STORE_DIR).join("accounts.json");
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
        .and_then(|users| serde_json::from_value::<Vec<SavedAccount>>(users.clone()).ok())
    else {
        return;
    };

    let Ok(json) = serde_json::to_string_pretty(&users) else {
        return;
    };
    if write(&new_path, &json).is_ok() {
        let _ = remove_file(&old_path);
        log_info!(
            "migrations: moved {} account(s) from the old store",
            users.len()
        );
    }
}
