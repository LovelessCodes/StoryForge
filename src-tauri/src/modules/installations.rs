use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{command, AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

use super::errors::UiError;

#[command]
pub async fn initialize_game(path: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        std::fs::create_dir_all(&pb).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    Ok("initialized".into())
}

#[command]
pub fn confirm_vintage_story_exe(path: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path);
    if pb.exists() && pb.is_file() {
        Ok(pb.to_string_lossy().into_owned())
    } else {
        Err(UiError {
            name: "not_found".into(),
            message: "Could not find Vintage Story executable.".into(),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayGameParams {
    pub installation_id: u64,
    pub server: Option<String>,
    pub password: Option<String>,
}

#[command]
pub fn play_game(app: AppHandle, options: Option<PlayGameParams>) -> Result<String, UiError> {
    let options = options.ok_or_else(|| UiError {
        name: "invalid_params".into(),
        message: "Invalid play game parameters.".into(),
    })?;
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(options.installation_id))
        })
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", options.installation_id),
        })?;
    let version_path = app
        .path()
        .app_data_dir()
        .unwrap()
        .join("versions")
        .join(installation["version"].as_str().unwrap());
    if !version_path.exists() || !version_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                version_path.to_string_lossy()
            ),
        });
    }
    let pb = PathBuf::from(installation["path"].as_str().unwrap());
    let start_params = installation["startParams"].as_str().unwrap_or("");
    let mut found_exe = false;
    let mut combined_path = PathBuf::from("/");
    for entry in walkdir::WalkDir::new(&version_path) {
        let entry = entry.map_err(|e| UiError::from(format!("walkdir error: {e}")))?;
        if entry.file_type().is_file() {
            let fname = entry.file_name().to_string_lossy();
            if fname.eq_ignore_ascii_case("vintagestory")
                || fname.eq_ignore_ascii_case("vintagestory.exe")
            {
                found_exe = true;
                combined_path = entry.path().to_path_buf();
                break;
            }
        }
    }
    if !found_exe {
        return Err(UiError::from(
            "Could not find Vintage Story executable in installation path",
        ));
    }
    if !combined_path.exists() || !combined_path.is_file() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Launch file not found: {}", combined_path.to_string_lossy()),
        });
    }
    let account_zustand = app
        .zustand()
        .get("accounts", "selectedUser")
        .ok_or_else(|| UiError {
            name: "no_account".into(),
            message: "No account selected".into(),
        })?;
    let account: Value = serde_json::from_value(account_zustand).unwrap();
    if account.is_null() {
        return Err(UiError {
            name: "no_account".into(),
            message: "No account selected".into(),
        });
    }
    let settings = json!({
        "stringSettings": {
            "playeruid": account["uid"].as_str().unwrap_or(""),
            "sessionkey": account["sessionkey"].as_str().unwrap_or(""),
            "sessionsignature": account["sessionsignature"].as_str().unwrap_or(""),
            "playername": account["playername"].as_str().unwrap_or(""),
        }
    });
    let settings_path = pb.join("clientsettings.json");
    // It should create the file if it does not exist, but if it exists it should just overwrite the keys
    if settings_path.exists() {
        let mut existing_settings = String::new();
        File::open(&settings_path)
            .and_then(|mut f| f.read_to_string(&mut existing_settings))
            .map_err(|e| UiError {
                name: "read_failed".into(),
                message: format!("Failed to read existing clientsettings.json: {e}"),
            })?;
        let mut existing_json: Value =
            serde_json::from_str(&existing_settings).unwrap_or(json!({}));
        if let Some(obj) = existing_json.as_object_mut() {
            if let Some(string_settings) = obj
                .get_mut("stringSettings")
                .and_then(|v| v.as_object_mut())
            {
                for (k, v) in settings["stringSettings"].as_object().unwrap() {
                    string_settings.insert(k.clone(), v.clone());
                }
            } else {
                obj.insert("stringSettings".into(), settings["stringSettings"].clone());
            }
        }
        std::fs::write(
            &settings_path,
            serde_json::to_string_pretty(&existing_json).unwrap(),
        )
        .map_err(|e| UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        })?;
        return Command::new(&combined_path.as_os_str())
            .args(&["--dataPath", &pb.as_path().to_string_lossy()])
            .args(
                &options
                    .server
                    .as_ref()
                    .map(|s| vec!["--connect", s.as_str()])
                    .unwrap_or_default(),
            )
            .args(
                &options
                    .password
                    .as_ref()
                    .map(|p| vec!["--password", p.as_str()])
                    .unwrap_or_default(),
            )
            .args(&start_params.split_whitespace().collect::<Vec<&str>>())
            .spawn()
            .map_err(|e| UiError {
                name: "launch_failed".into(),
                message: format!("Failed to launch: {e}"),
            })
            .map(|_| "started".into());
    } else {
        std::fs::create_dir_all(&settings_path.parent().unwrap()).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory for clientsettings.json: {e}"),
        })?;
        std::fs::write(
            &settings_path,
            serde_json::to_string_pretty(&settings).unwrap(),
        )
        .map_err(|e| UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        })?;
    }
    Command::new(&combined_path)
        .args(&["--dataPath", &pb.as_path().to_string_lossy()])
        .args(
            &options
                .server
                .as_ref()
                .map(|s| vec!["--connect", s.as_str()])
                .unwrap_or_default(),
        )
        .args(
            &options
                .password
                .as_ref()
                .map(|p| vec!["--password", p.as_str()])
                .unwrap_or_default(),
        )
        .args(&start_params.split_whitespace().collect::<Vec<&str>>())
        .spawn()
        .map_err(|e| UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        })?;
    Ok("started".into())
}

#[command]
pub fn reveal_in_file_explorer(path: String) -> Result<String, UiError> {
    let path = Path::new(&path);

    if cfg!(target_os = "windows") {
        // If it's a file, use /select, to highlight it. If it's a dir, just open it.
        if path.is_file() {
            Command::new("explorer")
                .args(["/select,", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        } else {
            Command::new("explorer")
                .arg(path.as_os_str().to_string_lossy().into_owned())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        }
    } else if cfg!(target_os = "macos") {
        if path.is_dir() {
            Command::new("open")
                .arg(&path.as_os_str())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        } else {
            Command::new("open")
                .args(["-R", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        }
    } else if cfg!(target_os = "linux") {
        // Try xdg-open for general desktops.
        // For files, most DEs open the default app; to "reveal", try the folder.
        let target = if path.is_file() {
            path.parent().unwrap_or(Path::new("/"))
        } else {
            path
        };
        // Prefer xdg-open; fall back to common file managers if needed.
        let status = Command::new("xdg-open").arg(target).status();
        if status.is_err() || !status.unwrap().success() {
            // Try common file managers
            let fm_cmds = [
                (
                    "nautilus",
                    vec![target.as_os_str().to_string_lossy().into_owned()],
                ),
                (
                    "dolphin",
                    vec![target.as_os_str().to_string_lossy().into_owned()],
                ),
                (
                    "thunar",
                    vec![target.as_os_str().to_string_lossy().into_owned()],
                ),
                (
                    "pcmanfm",
                    vec![target.as_os_str().to_string_lossy().into_owned()],
                ),
                (
                    "nemo",
                    vec![target.as_os_str().to_string_lossy().into_owned()],
                ),
            ];
            let mut launched = false;
            for (bin, args) in fm_cmds {
                if Command::new("sh")
                    .arg("-c")
                    .arg(format!("command -v {bin} >/dev/null 2>&1"))
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false)
                {
                    let st = Command::new(bin).args(&args).status();
                    if st.is_ok() && st.unwrap().success() {
                        launched = true;
                        break;
                    }
                }
            }
            if !launched {
                return Err(UiError {
                    name: "no_file_manager".into(),
                    message: "Could not find a file manager to open the path.".into(),
                });
            }
        }
    } else {
        return Err(UiError {
            name: "unsupported_platform".into(),
            message: "This platform is not supported for revealing files.".into(),
        });
    }

    Ok(path.as_os_str().to_string_lossy().to_string())
}

#[command]
pub fn remove_installation(app: AppHandle, id: i64) -> Result<String, UiError> {
    let installations_zustand = app.zustand().get("installations", "installations").unwrap();
    let mut installations_json: Value = serde_json::from_value(installations_zustand).unwrap();
    let installations_array = installations_json.as_array_mut().ok_or_else(|| UiError {
        name: "invalid_data".into(),
        message: "Installations data is not an array".into(),
    })?;
    let index = installations_array
        .iter()
        .position(|inst| inst["id"].as_i64() == Some(id));
    if let Some(idx) = index {
        let installation = &installations_array[idx];
        let path = installation["path"].as_str().unwrap_or("");
        // Remove the installation directory
        let pb = PathBuf::from(path);
        if pb.exists() && pb.is_dir() {
            std::fs::remove_dir_all(&pb).map_err(|e| UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove installation directory: {e}"),
            })?;
        }
        Ok("removed".into())
    } else {
        Err(UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", id),
        })
    }
}
