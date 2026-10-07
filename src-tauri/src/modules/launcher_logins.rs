//! Import of saved game logins from other launchers.
//!
//! Two sources are readable without touching an OS keyring:
//! - MVL's `data.json` `Accounts` list (plaintext sessions).
//! - The single legacy account VS Launcher/RiftLauncher wrote into
//!   `<appData>/{VSLauncher,RiftLauncher}/config.json` before sessions moved
//!   into the OS keyring.
//!
//! RiftLauncher's modern encrypted store cannot be opened without Electron's
//! `safeStorage`, so it is deliberately not offered.
//!
//! Secrets never reach the renderer: detection returns labels only, and the
//! import re-reads the files main-side to build `SavedAccount`s.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;
use tauri::{command, AppHandle, Manager};

use super::auth::SavedAccount;
use super::errors::UiError;
use crate::{log_error, log_info};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedLogin {
    /// Stable id used to import, e.g. `mvl:0` or `vsl:legacy`.
    pub id: String,
    /// Launcher name shown in the UI.
    pub source: String,
    pub label: String,
    pub detail: Option<String>,
}

/// Case-insensitive string field lookup; empty strings count as absent.
fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    for (key, entry) in object {
        if !keys
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(key))
        {
            continue;
        }
        if let Some(text) = entry.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn bool_field(value: &Value, key: &str) -> bool {
    value
        .as_object()
        .and_then(|object| {
            object
                .iter()
                .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
                .map(|(_, entry)| entry)
        })
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn account_from_fields(
    email: String,
    playername: Option<String>,
    uid: Option<String>,
    sessionkey: String,
    sessionsignature: Option<String>,
) -> SavedAccount {
    SavedAccount {
        uid,
        email,
        playername,
        sessionkey: Some(sessionkey),
        sessionsignature,
        selected: false,
    }
}

/// MVL accounts (id, account) as stored in `<Godot user dir>/MVL/data.json`.
fn collect_mvl_accounts() -> Vec<(String, SavedAccount)> {
    let Some(path) = super::mvl::config_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
    else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(root) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let Some(accounts) = root
        .as_object()
        .and_then(|object| {
            object
                .iter()
                .find(|(key, _)| key.eq_ignore_ascii_case("accounts"))
                .map(|(_, entry)| entry)
        })
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };

    accounts
        .iter()
        .enumerate()
        .filter_map(|(index, account)| {
            if bool_field(account, "offline") {
                return None;
            }
            let sessionkey = string_field(account, &["sessionkey"])?;
            let email = string_field(account, &["email"]).unwrap_or_default();
            let playername = string_field(account, &["playername"]);
            let uid = string_field(account, &["uid"]);
            let sessionsignature = string_field(account, &["sessionsignature"]);
            Some((
                format!("mvl:{index}"),
                account_from_fields(email, playername, uid, sessionkey, sessionsignature),
            ))
        })
        .collect()
}

/// Electron userData folders, where the launchers keep `config.json`.
fn config_candidates_for(dir_name: &str) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join("Library/Application Support").join(dir_name));
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        candidates.push(appdata.join(dir_name));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    if let Some(config) = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from) {
        candidates.push(config.join(dir_name));
    } else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".config").join(dir_name));
    }

    candidates
        .into_iter()
        .map(|dir| dir.join("config.json"))
        .collect()
}

/// The legacy single account older VS Launcher/RiftLauncher versions wrote
/// into `config.json` in the clear.
fn collect_legacy_account(dir_name: &str, id: &str) -> Option<(String, SavedAccount)> {
    for candidate in config_candidates_for(dir_name) {
        if !candidate.is_file() {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&candidate) else {
            continue;
        };
        let Ok(root) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let Some(sessionkey) = string_field(&root, &["sessionkey"]) else {
            continue;
        };
        let email = string_field(&root, &["email"]).unwrap_or_default();
        let playername = string_field(&root, &["playername"]);
        let uid = string_field(&root, &["playeruid"]);
        let sessionsignature = string_field(&root, &["sessionsignature"]);
        return Some((
            id.to_string(),
            account_from_fields(email, playername, uid, sessionkey, sessionsignature),
        ));
    }
    None
}

fn label_for(account: &SavedAccount, fallback: &str) -> String {
    account
        .playername
        .clone()
        .or_else(|| Some(account.email.clone()).filter(|email| !email.is_empty()))
        .unwrap_or_else(|| fallback.to_string())
}

fn detail_for(account: &SavedAccount) -> Option<String> {
    if account.playername.is_some() && !account.email.is_empty() {
        Some(account.email.clone())
    } else {
        None
    }
}

/// Saved logins we can read from other launchers, for the import sheet.
#[command]
pub fn detect_launcher_logins() -> Vec<DetectedLogin> {
    let mut logins: Vec<DetectedLogin> = collect_mvl_accounts()
        .into_iter()
        .map(|(id, account)| DetectedLogin {
            detail: detail_for(&account),
            id,
            label: label_for(&account, "MVL account"),
            source: "MVL".into(),
        })
        .collect();

    for (dir, source, id) in [
        ("VSLauncher", "VS Launcher", "vsl:legacy"),
        ("RiftLauncher", "RiftLauncher", "rift:legacy"),
    ] {
        if let Some((id, account)) = collect_legacy_account(dir, id) {
            logins.push(DetectedLogin {
                detail: detail_for(&account),
                id,
                label: label_for(&account, source),
                source: source.into(),
            });
        }
    }

    log_info!("detect_launcher_logins: {} logins found", logins.len());
    logins
}

/// Import the chosen logins into `accounts.json`, skipping duplicates.
#[command]
pub fn import_launcher_logins(app: AppHandle, ids: Vec<String>) -> Result<usize, UiError> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut collected = collect_mvl_accounts();
    for (dir, id) in [
        ("VSLauncher", "vsl:legacy"),
        ("RiftLauncher", "rift:legacy"),
    ] {
        if let Some(entry) = collect_legacy_account(dir, id) {
            collected.push(entry);
        }
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| UiError::new("path_error", format!("Failed to resolve app data dir: {e}")))?;
    let path = data_dir.join("accounts.json");
    let mut existing: Vec<SavedAccount> = if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| {
            log_error!("launcher_logins: read accounts failed: {e}");
            UiError::new("io_error", format!("Failed to read accounts.json: {e}"))
        })?;
        serde_json::from_str(&text).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut imported = 0usize;
    for (id, account) in collected {
        if !ids.iter().any(|chosen| chosen == &id) {
            continue;
        }
        let duplicate = existing.iter().any(|saved| {
            (account.uid.is_some() && saved.uid == account.uid)
                || (!account.email.is_empty() && saved.email.eq_ignore_ascii_case(&account.email))
        });
        if duplicate {
            continue;
        }
        let mut account = account;
        account.selected = existing.is_empty();
        existing.push(account);
        imported += 1;
    }

    if imported > 0 {
        let json = serde_json::to_string_pretty(&existing).map_err(|e| {
            UiError::new(
                "serialize_error",
                format!("Failed to serialize accounts: {e}"),
            )
        })?;
        std::fs::write(&path, json).map_err(|e| {
            log_error!("launcher_logins: write accounts failed: {e}");
            UiError::new("io_error", format!("Failed to write accounts.json: {e}"))
        })?;
    }

    log_info!("import_launcher_logins: {} imported", imported);
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_fields_case_insensitively() {
        let value = serde_json::json!({
            "PlayerName": "Mike",
            "sessionkey": "SECRET",
            "offline": false
        });
        assert_eq!(
            string_field(&value, &["playername"]).as_deref(),
            Some("Mike")
        );
        assert_eq!(
            string_field(&value, &["sessionkey"]).as_deref(),
            Some("SECRET")
        );
        assert!(!bool_field(&value, "Offline"));
    }

    #[test]
    fn skips_offline_and_sessionless_mvl_accounts() {
        // The collect path needs a real file, so the field rules are tested
        // through the shared helpers instead.
        let offline = serde_json::json!({ "PlayerName": "A", "Offline": true });
        assert!(bool_field(&offline, "offline"));
        let sessionless = serde_json::json!({ "PlayerName": "B" });
        assert!(string_field(&sessionless, &["sessionkey"]).is_none());
    }
}
