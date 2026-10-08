//! Import of saved game logins from other launchers.
//!
//! Sources readable without touching an OS keyring:
//! - Story Forge profiles and registered external game folders, whose
//!   `clientsettings.json` holds the session the game itself uses.
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

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::{command, AppHandle, Manager, State};

use super::auth::SavedAccount;
use super::errors::UiError;
use super::{paths, profiles, utils};
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLoginsReport {
    /// Sessions written to `accounts.json`.
    pub imported: usize,
    /// Labels of the sessions the auth server reported as expired.
    pub expired: Vec<String>,
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

/// The session stored in the game's own `clientsettings.json`.
fn account_from_clientsettings(root: &Value) -> Option<SavedAccount> {
    let settings = root
        .as_object()?
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case("stringSettings"))
        .map(|(_, entry)| entry)?;
    let sessionkey = string_field(settings, &["sessionkey"])?;
    let email = string_field(settings, &["useremail", "email"]).unwrap_or_default();
    let playername = string_field(settings, &["playername"]);
    let uid = string_field(settings, &["playeruid", "uid"]);
    let sessionsignature = string_field(settings, &["sessionsignature"]);
    Some(account_from_fields(
        email,
        playername,
        uid,
        sessionkey,
        sessionsignature,
    ))
}

/// A profile's game session, if the folder holds a signed-in client settings
/// file.
fn clientsettings_login(dir: &Path) -> Option<SavedAccount> {
    let text = std::fs::read_to_string(dir.join(paths::CLIENTSETTINGS_JSON)).ok()?;
    let root = serde_json::from_str::<Value>(&text).ok()?;
    account_from_clientsettings(&root)
}

/// Profiles that can hold a game session: the app's own profiles folder and
/// the registered external game directories. Returns `(id, label, dir)`.
fn profile_game_dirs(app: &AppHandle) -> Vec<(String, String, PathBuf)> {
    let mut out: Vec<(String, String, PathBuf)> = Vec::new();

    if let Ok(root) = utils::profiles_folder(app.clone()) {
        let root = root.join(utils::profiles_subdir(app.clone()));
        if let Ok(entries) = std::fs::read_dir(root) {
            for entry in entries.flatten() {
                let dir = entry.path();
                let folder = entry.file_name().to_string_lossy().to_string();
                if !dir.is_dir() || folder.starts_with('.') {
                    continue;
                }
                out.push((format!("profile:{folder}"), folder, dir));
            }
        }
    }

    for (index, dir) in profiles::external_profile_paths(app)
        .into_iter()
        .enumerate()
    {
        let label = dir
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| dir.to_string_lossy().to_string());
        out.push((format!("external:{index}"), label, dir));
    }

    out
}

/// Game sessions found in profiles, deduplicated across profiles signed into
/// the same account.
fn collect_profile_accounts(app: &AppHandle) -> Vec<(String, String, SavedAccount)> {
    let mut out: Vec<(String, String, SavedAccount)> = Vec::new();
    for (id, profile, dir) in profile_game_dirs(app) {
        let Some(account) = clientsettings_login(&dir) else {
            continue;
        };
        let duplicate = out.iter().any(|(_, _, seen)| {
            (account.uid.is_some() && seen.uid == account.uid)
                || (!account.email.is_empty() && seen.email.eq_ignore_ascii_case(&account.email))
        });
        if duplicate {
            continue;
        }
        out.push((id, profile, account));
    }
    out
}

fn detail_for(account: &SavedAccount) -> Option<String> {
    if account.playername.is_some() && !account.email.is_empty() {
        Some(account.email.clone())
    } else {
        None
    }
}

/// Saved logins we can read from this app's profiles and other launchers,
/// for the import sheet.
#[command]
pub fn detect_launcher_logins(app: AppHandle) -> Vec<DetectedLogin> {
    let mut logins: Vec<DetectedLogin> = collect_profile_accounts(&app)
        .into_iter()
        .map(|(id, profile, account)| DetectedLogin {
            detail: detail_for(&account).or_else(|| Some(profile.clone())),
            id,
            label: label_for(&account, &profile),
            source: "Story Forge".into(),
        })
        .collect();

    logins.extend(
        collect_mvl_accounts()
            .into_iter()
            .map(|(id, account)| DetectedLogin {
                detail: detail_for(&account),
                id,
                label: label_for(&account, "MVL account"),
                source: "MVL".into(),
            }),
    );

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

/// Import the chosen logins into `accounts.json`, skipping duplicates and
/// sessions the auth server rejects.
#[command]
pub async fn import_launcher_logins(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    ids: Vec<String>,
) -> Result<ImportLoginsReport, UiError> {
    let mut report = ImportLoginsReport {
        imported: 0,
        expired: Vec::new(),
    };
    if ids.is_empty() {
        return Ok(report);
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
    for (id, _profile, account) in collect_profile_accounts(&app) {
        collected.push((id, account));
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

        // Don't import sessions the auth server rejects. A failed check
        // (offline, HTTP error) leaves the session unverified and imports it;
        // the accounts list verifies again on load.
        if let (Some(uid), Some(sessionkey)) = (account.uid.clone(), account.sessionkey.clone()) {
            if super::auth::session_is_valid(&client, &uid, &sessionkey).await == Some(false) {
                log_info!("launcher_logins: skipping expired session '{id}'");
                report.expired.push(label_for(&account, &id));
                continue;
            }
        }

        let mut account = account;
        account.selected = existing.is_empty();
        existing.push(account);
        report.imported += 1;
    }

    if report.imported > 0 {
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

    log_info!(
        "import_launcher_logins: {} imported, {} expired",
        report.imported,
        report.expired.len()
    );
    Ok(report)
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

    #[test]
    fn reads_sessions_from_clientsettings() {
        let value = serde_json::json!({
            "otherSettings": { "foo": 1 },
            "stringSettings": {
                "sessionkey": "SECRET",
                "sessionsignature": "SIG",
                "playername": "Mike",
                "playeruid": "uid-1",
                "useremail": "mike@example.com",
                "mptoken": "MP"
            }
        });
        let account = account_from_clientsettings(&value).expect("session");
        assert_eq!(account.sessionkey.as_deref(), Some("SECRET"));
        assert_eq!(account.sessionsignature.as_deref(), Some("SIG"));
        assert_eq!(account.playername.as_deref(), Some("Mike"));
        assert_eq!(account.uid.as_deref(), Some("uid-1"));
        assert_eq!(account.email, "mike@example.com");
    }

    #[test]
    fn ignores_clientsettings_without_a_session() {
        let sessionless = serde_json::json!({
            "stringSettings": { "playername": "Mike", "useremail": "mike@example.com" }
        });
        assert!(account_from_clientsettings(&sessionless).is_none());
        assert!(account_from_clientsettings(&serde_json::json!({})).is_none());
    }
}
