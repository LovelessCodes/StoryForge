//! Shared "game defaults": another profile's client settings, read live at
//! launch and merged into every other profile.
//!
//! Vintage Story keeps key bindings and every game/video/audio setting in one
//! `clientsettings.json` per data path. One profile is the source of truth:
//! its current file is read whenever another profile launches, so changes made
//! in the source carry over without re-capturing. Account/session keys travel
//! only when the source explicitly opted in, and never the account-only state
//! (entitlements, gameserver flag) or `stringListSettings` (mod paths,
//! disabled mods, server list) — those are per-profile.

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;
use super::profiles::find_profile_by_id;
use crate::{log_error, log_info};

/// Sections a snapshot carries. `stringListSettings` is deliberately absent.
pub const SECTIONS: [&str; 5] = [
    "keyMapping",
    "intSettings",
    "boolSettings",
    "floatSettings",
    "stringSettings",
];

/// Keys that are never shared, even with the account-session option: owned
/// entitlements and the gameserver flag are account state the game re-checks.
pub const NEVER_SHARED_KEYS: [&str; 2] = ["entitlements", "hasGameServer"];

/// The signed-in player's session bundle. Read only when the source opted in,
/// and applied only when no launcher account overrides it.
pub const SESSION_KEYS: [&str; 6] = [
    "mptoken",
    "playername",
    "playeruid",
    "sessionkey",
    "sessionsignature",
    "useremail",
];

fn is_never_shared(key: &str) -> bool {
    NEVER_SHARED_KEYS
        .iter()
        .any(|k| k.eq_ignore_ascii_case(key))
}

fn is_session_key(key: &str) -> bool {
    SESSION_KEYS.iter().any(|k| k.eq_ignore_ascii_case(key))
}

/// Whether a sanitized snapshot actually picked up any session value.
pub fn carries_session(snapshot: &Value) -> bool {
    snapshot
        .get("stringSettings")
        .and_then(Value::as_object)
        .map(|settings| {
            settings
                .iter()
                .any(|(key, value)| is_session_key(key) && !value.as_str().unwrap_or("").is_empty())
        })
        .unwrap_or(false)
}

/// Copy the shareable sections of a `clientsettings.json` value. When
/// `include_session` is set, the signed-in player's session bundle is copied
/// too; entitlements and the gameserver flag never are.
pub fn snapshot_from(settings: &Value, include_session: bool) -> Value {
    let mut snapshot = Map::new();
    for section in SECTIONS {
        let Some(source) = settings.get(section).and_then(Value::as_object) else {
            continue;
        };
        let mut copy = Map::new();
        for (key, value) in source {
            if is_never_shared(key) {
                continue;
            }
            if is_session_key(key) && !include_session {
                continue;
            }
            copy.insert(key.clone(), value.clone());
        }
        if !copy.is_empty() {
            snapshot.insert(section.to_string(), Value::Object(copy));
        }
    }
    Value::Object(snapshot)
}

/// (key bindings, pooled settings) in a sanitized snapshot.
fn snapshot_counts(snapshot: &Value) -> (usize, usize) {
    let key_bindings = snapshot
        .get("keyMapping")
        .and_then(Value::as_object)
        .map(|map| map.len())
        .unwrap_or(0);
    let settings = SECTIONS
        .iter()
        .filter(|section| **section != "keyMapping")
        .filter_map(|section| snapshot.get(section).and_then(Value::as_object))
        .map(|map| map.len())
        .sum();
    (key_bindings, settings)
}

/// Merge a snapshot into a `clientsettings.json` value. Keys the target has
/// that the snapshot does not are kept, so newer game versions keep their
/// defaults; never-shared keys are skipped even if they somehow ended up in a
/// snapshot. The session bundle is copied only when `allow_session` is set
/// (the source opted in and no launcher account overrides it). Returns how
/// many keys were written.
pub fn apply_defaults(settings: &mut Value, defaults: &Value, allow_session: bool) -> usize {
    let Some(target) = settings.as_object_mut() else {
        return 0;
    };
    let mut written = 0;
    for section in SECTIONS {
        let Some(source) = defaults.get(section).and_then(Value::as_object) else {
            continue;
        };
        let section_target = target
            .entry(section.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        let Some(section_target) = section_target.as_object_mut() else {
            continue;
        };
        for (key, value) in source {
            if is_never_shared(key) {
                continue;
            }
            if is_session_key(key) && !allow_session {
                continue;
            }
            section_target.insert(key.clone(), value.clone());
            written += 1;
        }
    }
    written
}

/// Read the launch-time defaults out of the app settings store:
/// (apply, source profile id, include account session).
pub fn launch_defaults(app: &AppHandle) -> (bool, Option<u64>, bool) {
    let store = app.zustand();
    let apply = store
        .get::<bool>("settings", "applyGameDefaults")
        .unwrap_or(false);
    let source_profile_id = store
        .get::<Option<u64>>("settings", "gameDefaultsProfileId")
        .unwrap_or(None);
    let include_session = store
        .get::<bool>("settings", "gameDefaultsIncludeAccount")
        .unwrap_or(false);
    (apply, source_profile_id, include_session)
}

/// The source profile's current shareable settings, read fresh from disk.
/// Errors are logged and swallowed: a broken source must not block a launch.
pub fn live_snapshot(
    app: &AppHandle,
    source_profile_id: u64,
    include_session: bool,
) -> Option<Value> {
    let (dir, info) = match find_profile_by_id(app, source_profile_id) {
        Ok(found) => found,
        Err(error) => {
            log_error!(
                "[play_game] game defaults source profile {} not found: {}",
                source_profile_id,
                error.message
            );
            return None;
        }
    };
    let path = super::paths::clientsettings_path(&dir);
    if !path.exists() {
        log_error!(
            "[play_game] game defaults source {} has no clientsettings.json yet",
            info.name
        );
        return None;
    }
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) => {
            log_error!(
                "[play_game] game defaults: failed to read {}: {}",
                path.display(),
                error
            );
            return None;
        }
    };
    match serde_json::from_str::<Value>(&content) {
        Ok(settings) => Some(snapshot_from(&settings, include_session)),
        Err(error) => {
            log_error!(
                "[play_game] game defaults: failed to parse {}: {}",
                path.display(),
                error
            );
            None
        }
    }
}

/// What the settings card shows for the chosen source profile.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDefaultsPreview {
    pub source_profile: String,
    pub key_bindings: usize,
    pub settings: usize,
    /// The source opted in and actually carries a session value.
    pub includes_account: bool,
}

/// Read the chosen source profile's current settings for display (counts only,
/// never the values — session tokens must not reach the webview).
#[command]
pub fn preview_game_defaults(
    app: AppHandle,
    profile_id: u64,
    include_account_session: bool,
) -> Result<GameDefaultsPreview, UiError> {
    let (dir, info) = find_profile_by_id(&app, profile_id)?;
    let path = super::paths::clientsettings_path(&dir);
    if !path.exists() {
        return Err(UiError::new(
            "no_settings",
            "This profile has no clientsettings.json yet — launch it once first",
        ));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read clientsettings.json: {e}"),
    })?;
    let settings: Value = serde_json::from_str(&content).map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse clientsettings.json: {e}"),
    })?;

    let snapshot = snapshot_from(&settings, include_account_session);
    let (key_bindings, settings) = snapshot_counts(&snapshot);
    log_info!(
        "preview_game_defaults: {} ({} bindings, {} settings)",
        info.name.as_str(),
        key_bindings,
        settings
    );
    Ok(GameDefaultsPreview {
        source_profile: info.name,
        key_bindings,
        settings,
        includes_account: include_account_session && carries_session(&snapshot),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_settings() -> Value {
        serde_json::json!({
            "keyMapping": { "sprint": { "keyCode": 16 }, "inventory": { "keyCode": 69 } },
            "intSettings": { "viewDistance": 256, "musicLevel": 70 },
            "boolSettings": { "bloom": true, "hasGameServer": true },
            "floatSettings": { "gammaLevel": 1.0 },
            "stringSettings": {
                "language": "en",
                "sessionkey": "SECRET",
                "sessionsignature": "SIG",
                "mptoken": "MP",
                "playername": "Mike",
                "playeruid": "UID",
                "useremail": "mike@example.com",
                "entitlements": { "game": true }
            },
            "stringListSettings": {
                "multiplayerservers": ["Less,less.cx,"],
                "modPaths": ["Mods", "/Users/example/Mods"]
            },
            "dialogPositions": { "handbook": { "X": 1, "Y": 2 } }
        })
    }

    #[test]
    fn snapshot_keeps_settings_and_strips_session_by_default() {
        let snapshot = snapshot_from(&sample_settings(), false);
        assert_eq!(snapshot["keyMapping"]["sprint"]["keyCode"], 16);
        assert_eq!(snapshot["intSettings"]["viewDistance"], 256);
        assert_eq!(snapshot["boolSettings"]["bloom"], true);
        assert_eq!(snapshot["floatSettings"]["gammaLevel"], 1.0);
        assert_eq!(snapshot["stringSettings"]["language"], "en");

        // Session keys and never-shared state stay out by default.
        assert!(snapshot["stringSettings"].get("sessionkey").is_none());
        assert!(snapshot["stringSettings"].get("playername").is_none());
        assert!(snapshot["stringSettings"].get("entitlements").is_none());
        assert!(snapshot["boolSettings"].get("hasGameServer").is_none());
        assert!(snapshot.get("stringListSettings").is_none());
        assert!(snapshot.get("dialogPositions").is_none());
        assert!(!carries_session(&snapshot));
    }

    #[test]
    fn snapshot_includes_session_only_when_opted_in() {
        let snapshot = snapshot_from(&sample_settings(), true);
        assert_eq!(snapshot["stringSettings"]["sessionkey"], "SECRET");
        assert_eq!(snapshot["stringSettings"]["sessionsignature"], "SIG");
        assert_eq!(snapshot["stringSettings"]["mptoken"], "MP");
        assert_eq!(snapshot["stringSettings"]["playername"], "Mike");
        assert_eq!(snapshot["stringSettings"]["playeruid"], "UID");
        assert_eq!(snapshot["stringSettings"]["useremail"], "mike@example.com");
        assert_eq!(snapshot["stringSettings"]["language"], "en");
        assert!(carries_session(&snapshot));
        // Entitlements and the gameserver flag still never travel.
        assert!(snapshot["stringSettings"].get("entitlements").is_none());
        assert!(snapshot["boolSettings"].get("hasGameServer").is_none());
    }

    #[test]
    fn snapshot_counts_bindings_and_settings_separately() {
        let snapshot = snapshot_from(&sample_settings(), false);
        assert_eq!(snapshot_counts(&snapshot), (2, 5));
    }

    #[test]
    fn apply_merges_only_captured_keys_and_keeps_target_only_settings() {
        let defaults = snapshot_from(&sample_settings(), false);
        let mut target = serde_json::json!({
            "intSettings": { "viewDistance": 128, "targetOnly": 7 },
            "stringSettings": { "sessionkey": "TARGET_SESSION" },
            "stringListSettings": { "modPaths": ["Mods", "/target/Mods"] }
        });

        let written = apply_defaults(&mut target, &defaults, true);

        // 2 bindings + 2 ints + 1 bool + 1 float + 1 string.
        assert_eq!(written, 7);
        assert_eq!(target["intSettings"]["viewDistance"], 256);
        assert_eq!(target["intSettings"]["targetOnly"], 7);
        assert_eq!(target["boolSettings"]["bloom"], true);
        assert_eq!(target["keyMapping"]["inventory"]["keyCode"], 69);
        // The target's own session survives, and mod paths are untouched.
        assert_eq!(target["stringSettings"]["sessionkey"], "TARGET_SESSION");
        assert_eq!(target["stringListSettings"]["modPaths"][1], "/target/Mods");
    }

    #[test]
    fn session_bundle_applies_only_when_the_launcher_account_does_not_override() {
        let defaults = snapshot_from(&sample_settings(), true);

        // No launcher account selected: the live session bundle lands.
        let mut target = serde_json::json!({ "stringSettings": { "sessionkey": "OLD" } });
        apply_defaults(&mut target, &defaults, true);
        assert_eq!(target["stringSettings"]["sessionkey"], "SECRET");
        assert_eq!(target["stringSettings"]["playername"], "Mike");
        assert_eq!(target["stringSettings"]["useremail"], "mike@example.com");

        // A launcher account selected: the bundle is skipped, the rest still merges.
        let mut target = serde_json::json!({ "stringSettings": { "sessionkey": "LAUNCHER" } });
        apply_defaults(&mut target, &defaults, false);
        assert_eq!(target["stringSettings"]["sessionkey"], "LAUNCHER");
        assert_eq!(target["stringSettings"]["language"], "en");
    }
}
