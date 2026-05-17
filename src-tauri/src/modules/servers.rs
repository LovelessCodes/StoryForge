use reqwest::get;
use serde::Serialize;
use serde_json::{from_str, json, to_string_pretty, Map, Value};
use std::{
    fs::{read_dir, read_to_string, write},
    path::PathBuf,
};
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::installations::find_installation_by_id;
use super::utils::{installations_folder, installations_subdir};
use crate::{log_error, log_info};

#[derive(Debug, Clone, Serialize)]
pub struct SavedServer {
    pub id: u64,
    pub name: String,
    pub ip: String,
    pub port: Option<u16>,
    pub password: String,
    pub installation_id: u64,
    pub installation_name: String,
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
    // Same FNV-1a 32-bit as installations::generate_id, but for multiple fields
    let combined = format!("{}|{}|{}", name, ip, port.unwrap_or(0));
    let mut hash: u32 = 0x811c9dc5;
    for byte in combined.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    hash as u64
}

fn extract_servers_from_directory(
    dir: &PathBuf,
    installation_id: u64,
    installation_name: &str,
) -> Vec<SavedServer> {
    let mut servers = Vec::new();
    let clientsettings_path = dir.join("clientsettings.json");
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
                                id,
                                name,
                                ip,
                                port,
                                password,
                                installation_id,
                                installation_name: installation_name.to_string(),
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
    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);
    let mut all_servers: Vec<SavedServer> = Vec::new();

    if !installations_dir.is_dir() {
        return Ok(all_servers);
    }

    for entry in read_dir(&installations_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read installations dir: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Dir entry error: {e}"),
        })?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        // Get installation id from installation.json (same hash-based id)
        let inst_id = super::installations::generate_id(&dir_name);
        let servers = extract_servers_from_directory(&dir, inst_id, &dir_name);
        all_servers.extend(servers);
    }

    Ok(all_servers)
}

#[command]
pub fn remove_server_from_installation(
    app: AppHandle,
    installation_id: u64,
    server: String,
) -> Result<(), UiError> {
    log_info!("remove_server_from_installation: id={}", installation_id);
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let clientsettings_path = pb.join("clientsettings.json");
    let mut clientsettings: Value = if clientsettings_path.exists() {
        let content = read_to_string(&clientsettings_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read clientsettings.json: {e}"),
        })?;
        from_str(&content).map_err(|e| UiError {
            name: "parse_error".into(),
            message: format!("Failed to parse clientsettings.json: {e}"),
        })?
    } else {
        json!({})
    };
    // Extract or create stringListSettings as an object
    let mut string_list_settings = if let Some(sls) = clientsettings
        .get_mut("stringListSettings")
        .and_then(|sls| sls.as_object_mut())
    {
        sls.clone()
    } else {
        Map::new()
    };

    // Extract or create multiplayerservers as an array
    let mut multiplayer_servers = if let Some(ms) = string_list_settings
        .get_mut("multiplayerservers")
        .and_then(|ms| ms.as_array())
    {
        ms.clone()
    } else {
        Vec::new()
    };

    multiplayer_servers.retain(|s| s != &Value::String(server.as_str().to_string()));

    // Put the updated multiplayerservers back into string_list_settings
    string_list_settings.insert(
        "multiplayerservers".to_string(),
        Value::Array(multiplayer_servers),
    );

    // Put the updated string_list_settings back into clientsettings
    clientsettings["stringListSettings"] = Value::Object(string_list_settings);
    let new_content = to_string_pretty(&clientsettings).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize clientsettings.json: {e}"),
    })?;
    write(&clientsettings_path, new_content).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to write clientsettings.json: {e}"),
    })?;
    Ok(())
}

#[command]
pub fn check_server_in_installation(
    app: AppHandle,
    installation_id: u64,
    server: String,
) -> Result<bool, UiError> {
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let clientsettings_path = pb.join("clientsettings.json");
    if !clientsettings_path.exists() {
        return Ok(false);
    }
    let content = read_to_string(&clientsettings_path).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read clientsettings.json: {e}"),
    })?;
    let clientsettings: Value = from_str(&content).map_err(|e| UiError {
        name: "parse_error".into(),
        message: format!("Failed to parse clientsettings.json: {e}"),
    })?;
    if let Some(multiplayer_servers) = clientsettings
        .get("stringListSettings")
        .and_then(|sl| sl.get("multiplayerservers"))
        .and_then(|ms| ms.as_array())
    {
        for s in multiplayer_servers {
            if s == &Value::String(server.clone()) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[command]
pub fn add_server_to_installation(
    app: AppHandle,
    installation_id: u64,
    server: String,
) -> Result<(), UiError> {
    log_info!("add_server_to_installation: id={}", installation_id);
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let clientsettings_path = pb.join("clientsettings.json");
    let mut clientsettings: Value = if clientsettings_path.exists() {
        let content = read_to_string(&clientsettings_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read clientsettings.json: {e}"),
        })?;
        from_str(&content).map_err(|e| UiError {
            name: "parse_error".into(),
            message: format!("Failed to parse clientsettings.json: {e}"),
        })?
    } else {
        json!({})
    };
    // Extract or create stringListSettings as an object
    let mut string_list_settings = if let Some(sls) = clientsettings
        .get_mut("stringListSettings")
        .and_then(|sls| sls.as_object_mut())
    {
        sls.clone()
    } else {
        Map::new()
    };

    // Extract or create multiplayerservers as an array
    let mut multiplayer_servers = if let Some(ms) = string_list_settings
        .get_mut("multiplayerservers")
        .and_then(|ms| ms.as_array())
    {
        ms.clone()
    } else {
        Vec::new()
    };

    multiplayer_servers.push(Value::String(server));

    // Put the updated multiplayerservers back into string_list_settings
    string_list_settings.insert(
        "multiplayerservers".to_string(),
        Value::Array(multiplayer_servers),
    );

    // Put the updated string_list_settings back into clientsettings
    clientsettings["stringListSettings"] = Value::Object(string_list_settings);
    let new_content = to_string_pretty(&clientsettings).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize clientsettings.json: {e}"),
    })?;
    write(&clientsettings_path, new_content).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to write clientsettings.json: {e}"),
    })?;
    Ok(())
}

#[command]
pub async fn fetch_public_servers() -> Result<Value, UiError> {
    log_info!("fetch_public_servers");
    let url = "https://masterserver.vintagestory.at/api/v1/servers/list";
    let res = get(url).await.map_err(|e| {
        log_error!("fetch_public_servers: request failed: {e}");
        UiError::from(format!("Request error: {e}"))
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
        UiError::from(format!("Read error: {e}"))
    })?;
    let json: Value = from_str(&res_text).map_err(|e| {
        log_error!("fetch_public_servers: parse failed: {e}");
        UiError::from(format!("Parse error: {e}"))
    })?;
    Ok(json)
}
