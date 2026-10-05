//! Shared "game defaults": a sanitized snapshot of one profile's client
//! settings that can be merged into any profile right before the game
//! launches.
//!
//! Vintage Story keeps key bindings and every game/video/audio setting in one
//! `clientsettings.json` per data path. A snapshot carries the `keyMapping`
//! and the pooled setting dictionaries — never the account/session keys (a
//! session must not leak between profiles) and never `stringListSettings`
//! (mod paths, disabled mods and the server list are per-profile state).

use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;
use super::profiles::find_profile_by_id;
use crate::log_info;

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

/// The signed-in player's session bundle. Copied only when a capture
/// explicitly opted in (`includeAccountSession`), and applied only when no
/// launcher account is selected for the launch.
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

/// True when a snapshot carries the account-session marker.
pub fn includes_account(snapshot: &Value) -> bool {
    snapshot
        .get("includesAccount")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

/// Whether the snapshot actually picked up any session value.
fn snapshot_has_session(snapshot: &Value) -> bool {
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

/// Merge a snapshot into a `clientsettings.json` value. Keys the target has
/// that the snapshot does not are kept, so newer game versions keep their
/// defaults; never-shared keys are skipped even if they somehow ended up in a
/// snapshot. The copied session bundle applies only when the snapshot carries
/// it and `allow_session` is set (no launcher account overrides it). Returns
/// how many keys were written.
pub fn apply_defaults(settings: &mut Value, defaults: &Value, allow_session: bool) -> usize {
    let session_allowed = allow_session && includes_account(defaults);
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
            if is_session_key(key) && !session_allowed {
                continue;
            }
            section_target.insert(key.clone(), value.clone());
            written += 1;
        }
    }
    written
}

/// Capture a profile's shareable settings as the game defaults.
#[command]
pub fn capture_game_defaults(
    app: AppHandle,
    profile_id: u64,
    include_account_session: bool,
) -> Result<Value, UiError> {
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

    let mut snapshot = snapshot_from(&settings, include_account_session);
    let has_session = include_account_session && snapshot_has_session(&snapshot);
    if let Some(object) = snapshot.as_object_mut() {
        if has_session {
            object.insert("includesAccount".into(), json!(true));
        }
        object.insert("capturedAt".into(), json!(now_ms()));
        object.insert("sourceProfile".into(), json!(info.name));
    }
    log_info!(
        "capture_game_defaults: captured from {} (session: {})",
        info.name.as_str(),
        includes_account(&snapshot)
    );
    Ok(snapshot)
}

/// Read the launch-time defaults out of the app settings store.
pub fn launch_defaults(app: &AppHandle) -> (bool, Option<Value>) {
    let store = app.zustand();
    let apply = store
        .get::<bool>("settings", "applyGameDefaults")
        .unwrap_or(false);
    let defaults = store
        .get::<Value>("settings", "gameDefaults")
        .ok()
        .filter(|value| !value.is_null());
    (apply, defaults)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_settings() -> Value {
        json!({
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
        // Entitlements and the gameserver flag still never travel.
        assert!(snapshot["stringSettings"].get("entitlements").is_none());
        assert!(snapshot["boolSettings"].get("hasGameServer").is_none());
    }

    #[test]
    fn apply_merges_only_captured_keys_and_keeps_target_only_settings() {
        let defaults = snapshot_from(&sample_settings(), false);
        let mut target = json!({
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
    fn session_bundle_applies_when_opted_in_and_no_account_overrides_it() {
        let mut defaults = snapshot_from(&sample_settings(), true);
        defaults["includesAccount"] = json!(true);

        // No launcher account selected: the copied bundle lands.
        let mut target = json!({ "stringSettings": { "sessionkey": "OLD" } });
        apply_defaults(&mut target, &defaults, true);
        assert_eq!(target["stringSettings"]["sessionkey"], "SECRET");
        assert_eq!(target["stringSettings"]["playername"], "Mike");
        assert_eq!(target["stringSettings"]["useremail"], "mike@example.com");

        // A launcher account selected: the bundle is skipped, the rest still merges.
        let mut target = json!({ "stringSettings": { "sessionkey": "LAUNCHER" } });
        apply_defaults(&mut target, &defaults, false);
        assert_eq!(target["stringSettings"]["sessionkey"], "LAUNCHER");
        assert_eq!(target["stringSettings"]["language"], "en");
    }

    #[test]
    fn apply_tolerates_a_session_key_smuggled_in_without_the_marker() {
        let mut target = json!({ "stringSettings": { "sessionkey": "KEEP" } });
        let defaults = json!({ "stringSettings": { "sessionkey": "STOLEN", "language": "de" } });

        let written = apply_defaults(&mut target, &defaults, true);

        assert_eq!(written, 1);
        assert_eq!(target["stringSettings"]["sessionkey"], "KEEP");
        assert_eq!(target["stringSettings"]["language"], "de");
    }
}
