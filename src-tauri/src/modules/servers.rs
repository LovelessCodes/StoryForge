use serde_json::Value;
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;
use super::utils::installations_folder;

fn extract_servers_from_directory(path: std::path::PathBuf) -> Value {
    let mut servers = Value::Array(vec![]);
    let clientsettings_path = path.join("clientsettings.json");
    if let Ok(content) = std::fs::read_to_string(clientsettings_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(multiplayer_servers) = json
                .get("stringListSettings")
                .and_then(|sl| sl.get("multiplayerservers"))
            {
                if let Some(array) = servers.as_array_mut() {
                    array.push(multiplayer_servers.clone());
                }
            }
        }
    }
    servers
}

#[command]
pub async fn fetch_all_servers(app: AppHandle) -> Result<Value, UiError> {
    let installation_paths = installations_folder(app.clone()).join("installations");
    let mut all_servers = Vec::new();
    for entry in std::fs::read_dir(installation_paths).unwrap() {
        let entry = entry.unwrap();
        if entry.path().is_dir() {
            let servers = extract_servers_from_directory(entry.path());
            let installation_name = entry
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string();
            let mut installation_servers = serde_json::Map::new();
            installation_servers.insert(installation_name, servers);
            all_servers.push(Value::Object(installation_servers));
        }
    }
    Ok(Value::Array(all_servers))
}

#[command]
pub fn remove_server_from_installation(
    app: AppHandle,
    installation_id: u64,
    server: String,
) -> Result<(), UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(installation_id))
        })
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", installation_id),
        })?;
    let installation_path = installation["path"].as_str().ok_or_else(|| UiError {
        name: "invalid_data".into(),
        message: "Installation path is not a string".into(),
    })?;
    let clientsettings_path = std::path::Path::new(installation_path).join("clientsettings.json");
    let mut clientsettings: Value = if clientsettings_path.exists() {
        let content = std::fs::read_to_string(&clientsettings_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read clientsettings.json: {e}"),
        })?;
        serde_json::from_str(&content).map_err(|e| UiError {
            name: "parse_error".into(),
            message: format!("Failed to parse clientsettings.json: {e}"),
        })?
    } else {
        serde_json::json!({})
    };
    // Extract or create stringListSettings as an object
    let mut string_list_settings = if let Some(sls) = clientsettings
        .get_mut("stringListSettings")
        .and_then(|sls| sls.as_object_mut())
    {
        sls.clone()
    } else {
        serde_json::Map::new()
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
    let new_content = serde_json::to_string_pretty(&clientsettings).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize clientsettings.json: {e}"),
    })?;
    std::fs::write(&clientsettings_path, new_content).map_err(|e| UiError {
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
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(installation_id))
        })
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", installation_id),
        })?;
    let installation_path = installation["path"].as_str().ok_or_else(|| UiError {
        name: "invalid_data".into(),
        message: "Installation path is not a string".into(),
    })?;
    let clientsettings_path = std::path::Path::new(installation_path).join("clientsettings.json");
    if !clientsettings_path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&clientsettings_path).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read clientsettings.json: {e}"),
    })?;
    let clientsettings: Value = serde_json::from_str(&content).map_err(|e| UiError {
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
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(installation_id))
        })
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", installation_id),
        })?;
    let installation_path = installation["path"].as_str().ok_or_else(|| UiError {
        name: "invalid_data".into(),
        message: "Installation path is not a string".into(),
    })?;
    let clientsettings_path = std::path::Path::new(installation_path).join("clientsettings.json");
    let mut clientsettings: Value = if clientsettings_path.exists() {
        let content = std::fs::read_to_string(&clientsettings_path).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read clientsettings.json: {e}"),
        })?;
        serde_json::from_str(&content).map_err(|e| UiError {
            name: "parse_error".into(),
            message: format!("Failed to parse clientsettings.json: {e}"),
        })?
    } else {
        serde_json::json!({})
    };
    // Extract or create stringListSettings as an object
    let mut string_list_settings = if let Some(sls) = clientsettings
        .get_mut("stringListSettings")
        .and_then(|sls| sls.as_object_mut())
    {
        sls.clone()
    } else {
        serde_json::Map::new()
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
    let new_content = serde_json::to_string_pretty(&clientsettings).map_err(|e| UiError {
        name: "serialize_error".into(),
        message: format!("Failed to serialize clientsettings.json: {e}"),
    })?;
    std::fs::write(&clientsettings_path, new_content).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to write clientsettings.json: {e}"),
    })?;
    Ok(())
}

#[command]
pub async fn fetch_public_servers() -> Result<Value, UiError> {
    let client = reqwest::Client::new();
    let url = "https://masterserver.vintagestory.at/api/v1/servers/list";
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;
    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }
    let res_text = res
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;
    let json: Value =
        serde_json::from_str(&res_text).map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}
