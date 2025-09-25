use serde_json::{from_value, Value};
use std::path::Path;
use tauri::{command, AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;

// The result should be a list of objects that contain the name of the save, and the installation it belongs to
// e.g. [{ name: "Save 1", installation: "Installation 1" }, { name: "Save 2", installation: "Installation 2" }]
#[command]
pub fn get_all_saves(app: AppHandle) -> Result<Vec<(String, String)>, UiError> {
    // Look through all installation folders and collect save names from the .vcdbs files
    let installation_dir_path = app.path().app_data_dir().unwrap().join("installations");
    let mut saves = Vec::new();
    if installation_dir_path.exists() && installation_dir_path.is_dir() {
        for entry in std::fs::read_dir(installation_dir_path)
            .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            let installation_name = entry.file_name().into_string().unwrap_or_default();
            if path.is_dir() {
                let saves_path = path.join("Saves");
                if saves_path.exists() && saves_path.is_dir() {
                    for save_entry in std::fs::read_dir(saves_path)
                        .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
                    {
                        let save_entry = save_entry
                            .map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
                        let save_path = save_entry.path();
                        if save_path.is_file() {
                            if let Some(ext) = save_path.extension() {
                                if ext == "vcdbs" {
                                    if let Some(file_stem) = save_path.file_stem() {
                                        if let Some(save_name) = file_stem.to_str() {
                                            saves.push((
                                                save_name.to_string(),
                                                installation_name.clone(),
                                            ));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(saves)
}

#[command]
pub fn get_installation_saves(
    app: AppHandle,
    installation_id: u64,
) -> Result<Vec<String>, UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json.as_array().and_then(|arr| {
        arr.iter()
            .find(|inst| inst["id"].as_u64() == Some(installation_id))
    });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            // Optionally, log the error or handle it as needed
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let saves_path = Path::new(installation["path"].as_str().unwrap()).join("Saves");

    // Traverse the saves directory and collect save names from the .vcdbs files
    let mut saves = Vec::new();
    if saves_path.exists() && saves_path.is_dir() {
        for entry in std::fs::read_dir(saves_path)
            .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "vcdbs" {
                        if let Some(file_stem) = path.file_stem() {
                            if let Some(save_name) = file_stem.to_str() {
                                saves.push(save_name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(saves)
}
