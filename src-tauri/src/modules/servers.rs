use serde::Serialize;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    collections::HashSet,
    fs::{read_to_string, write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, Manager, State};

use super::errors::UiError;
use super::paths;
use super::profiles::find_profile_by_id;
use crate::{log_error, log_info};

#[derive(Debug, Clone, Serialize)]
pub struct SavedServer {
    /// Address-scoped id (name|ip|port hash) — favorites are stored against it.
    pub id: u64,
    /// Row identity: the same server can exist in several profiles, so the
    /// profile is part of the key the frontend uses for list/store operations.
    pub row_key: String,
    pub name: String,
    pub ip: String,
    pub port: Option<u16>,
    pub password: String,
    pub profile_id: u64,
    pub profile_name: String,
    pub favorite: bool,
}

// Tracked separately from clientsettings.json (shared with the game client),
// keyed by the same id fetch_all_servers assigns.
fn server_favorites_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    let dir = app.path().app_data_dir().map_err(|e| UiError {
        name: "app_data_failed".into(),
        message: format!("Failed to get app data dir: {e}"),
    })?;
    Ok(dir.join("server_favorites.json"))
}

fn read_server_favorites(app: &AppHandle) -> HashSet<u64> {
    let path = match server_favorites_path(app) {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };
    read_to_string(&path)
        .ok()
        .and_then(|content| from_str::<Vec<u64>>(&content).ok())
        .map(|ids| ids.into_iter().collect())
        .unwrap_or_default()
}

fn write_server_favorites(app: &AppHandle, favorites: &HashSet<u64>) -> Result<(), UiError> {
    let path = server_favorites_path(app)?;
    let ids: Vec<u64> = favorites.iter().copied().collect();
    let content = to_string_pretty(&ids).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize server favorites: {e}"),
    })?;
    write(&path, content).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to write server favorites: {e}"),
    })
}

#[command]
pub fn set_server_favorite(app: AppHandle, id: u64, favorite: bool) -> Result<(), UiError> {
    log_info!("set_server_favorite: id={} favorite={}", id, favorite);
    let mut favorites = read_server_favorites(&app);
    if favorite {
        favorites.insert(id);
    } else {
        favorites.remove(&id);
    }
    write_server_favorites(&app, &favorites)
}

fn parse_server_string(raw: &str) -> Option<(String, String, Option<u16>, String)> {
    // Format: "Name,ip:port,password" or "Name,ip,password" or "Name,ip:port"
    let parts: Vec<&str> = raw.splitn(4, ',').collect();
    if parts.len() < 2 {
        return None;
    }
    let name = parts[0].to_string();
    let addr = parts[1];
    let password = parts.get(2).map(|s| s.to_string()).unwrap_or_default();

    // Parse ip:port
    if let Some((ip, port_str)) = addr.rsplit_once(':') {
        if let Ok(port) = port_str.parse::<u16>() {
            return Some((name, ip.to_string(), Some(port), password));
        }
    }
    Some((name, addr.to_string(), None, password))
}

fn server_id(name: &str, ip: &str, port: Option<u16>) -> u64 {
    // Same FNV-1a 32-bit as profiles::generate_id, but for multiple fields
    let combined = format!("{}|{}|{}", name, ip, port.unwrap_or(0));
    let mut hash: u32 = 0x811c9dc5;
    for byte in combined.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    hash as u64
}

fn extract_servers_from_directory(
    dir: &Path,
    profile_id: u64,
    profile_name: &str,
    favorites: &HashSet<u64>,
) -> Vec<SavedServer> {
    let mut servers = Vec::new();
    let clientsettings_path = paths::clientsettings_path(dir);
    if let Ok(content) = read_to_string(clientsettings_path) {
        if let Ok(json) = from_str::<Value>(&content) {
            if let Some(multiplayer_servers) = json
                .get("stringListSettings")
                .and_then(|sl| sl.get("multiplayerservers"))
                .and_then(|ms| ms.as_array())
            {
                for entry in multiplayer_servers {
                    if let Some(raw) = entry.as_str() {
                        if let Some((name, ip, port, password)) = parse_server_string(raw) {
                            let id = server_id(&name, &ip, port);
                            servers.push(SavedServer {
                                row_key: format!("{}:{}", profile_id, id),
                                id,
                                name,
                                ip,
                                port,
                                password,
                                profile_id,
                                profile_name: profile_name.to_string(),
                                favorite: favorites.contains(&id),
                            });
                        }
                    }
                }
            }
        }
    }
    servers
}

#[command]
pub fn fetch_all_servers(app: AppHandle) -> Result<Vec<SavedServer>, UiError> {
    log_info!("fetch_all_servers");
    let mut all_servers: Vec<SavedServer> = Vec::new();

    let favorites = read_server_favorites(&app);

    // Includes adopted game data folders registered outside the root.
    for dir in super::profiles::all_profile_dirs(&app)? {
        let dir_name = crate::modules::utils::dir_name(&dir);
        // Get profile id from profile.json (same hash-based id)
        let inst_id = crate::modules::utils::generate_id(&dir_name);
        let servers = extract_servers_from_directory(&dir, inst_id, &dir_name, &favorites);
        all_servers.extend(servers);
    }

    // Prune favorites with no matching live server — catches removal from
    // either StoryForge or direct edits to the game's own config/launcher.
    let live_ids: HashSet<u64> = all_servers.iter().map(|s| s.id).collect();
    if favorites.iter().any(|id| !live_ids.contains(id)) {
        let pruned: HashSet<u64> = favorites.intersection(&live_ids).copied().collect();
        if let Err(e) = write_server_favorites(&app, &pruned) {
            log_error!(
                "fetch_all_servers: failed to prune stale favorites: {}",
                e.message
            );
        }
    }

    Ok(all_servers)
}

/// Reads an profile's `clientsettings.json`, or an empty object.
fn read_clientsettings(profile_dir: &Path) -> Result<Value, UiError> {
    let path = paths::clientsettings_path(profile_dir);
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = read_to_string(&path).map_err(|e| {
        UiError::new(
            "io_error",
            format!("Failed to read clientsettings.json: {e}"),
        )
    })?;
    from_str(&content).map_err(|e| {
        UiError::new(
            "parse_error",
            format!("Failed to parse clientsettings.json: {e}"),
        )
    })
}

/// Returns the profile's configured multiplayer servers.
fn multiplayer_servers(profile_dir: &Path) -> Result<Vec<Value>, UiError> {
    let clientsettings = read_clientsettings(profile_dir)?;
    Ok(clientsettings
        .get("stringListSettings")
        .and_then(|sl| sl.get("multiplayerservers"))
        .and_then(|ms| ms.as_array())
        .cloned()
        .unwrap_or_default())
}

/// Applies `mutate` to `stringListSettings.multiplayerservers` and writes the
/// file back, creating both the file and the nested keys when missing.
fn update_multiplayer_servers<F>(profile_dir: &Path, mutate: F) -> Result<(), UiError>
where
    F: FnOnce(&mut Vec<Value>),
{
    let clientsettings_path = paths::clientsettings_path(profile_dir);
    let mut clientsettings = read_clientsettings(profile_dir)?;

    let mut string_list_settings = clientsettings
        .get_mut("stringListSettings")
        .and_then(|sls| sls.as_object_mut())
        .cloned()
        .unwrap_or_default();

    let mut servers = string_list_settings
        .get_mut("multiplayerservers")
        .and_then(|ms| ms.as_array())
        .cloned()
        .unwrap_or_default();

    mutate(&mut servers);

    string_list_settings.insert("multiplayerservers".to_string(), Value::Array(servers));
    clientsettings["stringListSettings"] = Value::Object(string_list_settings);

    let new_content = to_string_pretty(&clientsettings).map_err(|e| {
        UiError::new(
            "serialize_error",
            format!("Failed to serialize clientsettings.json: {e}"),
        )
    })?;
    write(&clientsettings_path, new_content).map_err(|e| {
        UiError::new(
            "io_error",
            format!("Failed to write clientsettings.json: {e}"),
        )
    })?;
    Ok(())
}

#[command]
pub fn remove_server_from_profile(
    app: AppHandle,
    profile_id: u64,
    server: String,
) -> Result<(), UiError> {
    log_info!("remove_server_from_profile: id={}", profile_id);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    update_multiplayer_servers(&pb, move |servers| {
        servers.retain(|s| s != &Value::String(server.clone()))
    })
}

#[command]
pub fn check_server_in_profile(
    app: AppHandle,
    profile_id: u64,
    server: String,
) -> Result<bool, UiError> {
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let server = Value::String(server);
    Ok(multiplayer_servers(&pb)?.iter().any(|s| s == &server))
}

#[command]
pub fn add_server_to_profile(
    app: AppHandle,
    profile_id: u64,
    server: String,
) -> Result<(), UiError> {
    log_info!("add_server_to_profile: id={}", profile_id);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    update_multiplayer_servers(&pb, move |servers| servers.push(Value::String(server)))
}

#[command]
pub async fn fetch_public_servers(
    client: State<'_, Arc<reqwest::Client>>,
) -> Result<Value, UiError> {
    log_info!("fetch_public_servers");
    let url = "https://masterserver.vintagestory.at/api/v1/servers/list";
    let res = client.get(url).send().await.map_err(|e| {
        log_error!("fetch_public_servers: request failed: {e}");
        UiError::new("request_error", format!("Request error: {e}"))
    })?;
    if !res.status().is_success() {
        log_error!("fetch_public_servers: HTTP {}", res.status());
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }
    let res_text = res.text().await.map_err(|e| {
        log_error!("fetch_public_servers: read failed: {e}");
        UiError::new("io_error", format!("Read error: {e}"))
    })?;
    let json: Value = from_str(&res_text).map_err(|e| {
        log_error!("fetch_public_servers: parse failed: {e}");
        UiError::new("parse_error", format!("Parse error: {e}"))
    })?;
    Ok(json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_server_string_handles_variants() {
        assert_eq!(
            parse_server_string("My Server,example.com:42420,secret"),
            Some((
                "My Server".to_string(),
                "example.com".to_string(),
                Some(42420),
                "secret".to_string()
            ))
        );
        assert_eq!(
            parse_server_string("NoPort,10.0.0.1"),
            Some((
                "NoPort".to_string(),
                "10.0.0.1".to_string(),
                None,
                String::new()
            ))
        );
        assert_eq!(
            parse_server_string("Pw,10.0.0.1:1,hunter2"),
            Some((
                "Pw".to_string(),
                "10.0.0.1".to_string(),
                Some(1),
                "hunter2".to_string()
            ))
        );
        // Invalid port stays part of the address, password still parsed.
        assert_eq!(
            parse_server_string("Bad,host:notaport,pw"),
            Some((
                "Bad".to_string(),
                "host:notaport".to_string(),
                None,
                "pw".to_string()
            ))
        );
        assert_eq!(parse_server_string("onlyname"), None);
        assert_eq!(parse_server_string(""), None);
    }
}
