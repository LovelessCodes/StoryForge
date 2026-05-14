use json5;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    fs::{create_dir_all, read_dir, remove_dir_all, write, File},
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{command, AppHandle, Emitter, Manager};
use tauri_plugin_zustand::ManagerExt;
use walkdir::WalkDir;

use super::dotnet;
use super::errors::UiError;
use super::utils::{
    installations_folder, installations_subdir, move_folder, versions_folder, versions_subdir,
};

// --- Installation JSON5 persistence ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationInfo {
    pub name: String,
    pub version: String,
    #[serde(rename = "startParams")]
    pub start_params: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallationResult {
    pub id: u64,
    pub name: String,
    pub version: String,
    #[serde(rename = "startParams")]
    pub start_params: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn dir_size(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                total += dir_size(&path);
            } else if let Ok(meta) = path.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub fn generate_id(name: &str) -> u64 {
    // FNV-1a 32-bit — deterministic, fits JS safe integer (< 2^53)
    let mut hash: u32 = 0x811c9dc5;
    for byte in name.bytes() {
        hash ^= byte as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    hash as u64
}

pub fn read_installation_json(dir: &Path) -> Result<InstallationInfo, UiError> {
    let file_path = dir.join("installation.json");
    if !file_path.exists() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("installation.json not found in {}", dir.to_string_lossy()),
        });
    }
    let content = std::fs::read_to_string(&file_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read {}: {e}", file_path.to_string_lossy()),
    })?;
    let info: InstallationInfo = json5::from_str(&content).map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(info)
}

pub fn write_installation_json(dir: &Path, info: &InstallationInfo) -> Result<(), UiError> {
    if !dir.exists() {
        create_dir_all(dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    let file_path = dir.join("installation.json");
    let content = json5::to_string(info).map_err(|e| UiError {
        name: "serialize_failed".into(),
        message: format!("Failed to serialize installation.json: {e}"),
    })?;
    write(&file_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(())
}

pub fn find_installation_by_id(
    app: &AppHandle,
    id: u64,
) -> Result<(PathBuf, InstallationInfo), UiError> {
    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);
    if !installations_dir.exists() || !installations_dir.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", id),
        });
    }
    for entry in read_dir(&installations_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read installations directory: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read directory entry: {e}"),
        })?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let name = dir_name(&dir);
        if generate_id(&name) != id {
            continue;
        }
        let inst_json = dir.join("installation.json");
        if inst_json.exists() {
            let info = read_installation_json(&dir)?;
            return Ok((dir, info));
        }
        // No installation.json but dir exists — treat as valid
        return Ok((
            dir,
            InstallationInfo {
                name,
                version: String::new(),
                start_params: String::new(),
            },
        ));
    }
    Err(UiError {
        name: "not_found".into(),
        message: format!("Installation with id {} not found", id),
    })
}

#[command]
pub fn get_all_installations(app: AppHandle) -> Result<Vec<InstallationResult>, UiError> {
    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);

    // Ensure dir exists
    if !installations_dir.exists() {
        create_dir_all(&installations_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create installations directory: {e}"),
        })?;
    }

    // --- Migration: read old zustand store, write installation.json for each existing dir ---
    if let Ok(old_raw) = app.zustand().get::<Value>("installations", "installations") {
        if let Some(old_arr) = old_raw.as_array() {
            for old_inst in old_arr {
                let old_path_str = old_inst["path"].as_str().unwrap_or("");
                let old_pb = PathBuf::from(old_path_str);
                if old_pb.exists() && old_pb.is_dir() {
                    let inst_json = old_pb.join("installation.json");
                    if !inst_json.exists() {
                        let info = InstallationInfo {
                            name: old_inst["name"].as_str().unwrap_or("").to_string(),
                            version: old_inst["version"].as_str().unwrap_or("").to_string(),
                            start_params: old_inst["startParams"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                        };
                        let _ = write_installation_json(&old_pb, &info);
                    }
                }
            }
        }
    }

    // --- Scan directories ---
    let mut results: Vec<InstallationResult> = Vec::new();
    if installations_dir.is_dir() {
        for entry in read_dir(&installations_dir).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read installations directory: {e}"),
        })? {
            let entry = entry.map_err(|e| UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            })?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            let id = generate_id(&dir_name);

            // Check if it looks like an installation (has Mods dir or installation.json)
            let has_mods = dir.join("Mods").is_dir();
            let has_saves = dir.join("Saves").is_dir();
            let has_json = dir.join("installation.json").exists();

            if !has_mods && !has_saves && !has_json {
                continue;
            }

            let info = if has_json {
                read_installation_json(&dir).unwrap_or_else(|_| InstallationInfo {
                    name: dir_name.clone(),
                    version: String::new(),
                    start_params: String::new(),
                })
            } else {
                let info = InstallationInfo {
                    name: dir_name.clone(),
                    version: String::new(),
                    start_params: String::new(),
                };
                let _ = write_installation_json(&dir, &info);
                info
            };

            let size_bytes = dir_size(&dir);
            results.push(InstallationResult {
                id,
                name: info.name,
                version: info.version,
                start_params: info.start_params,
                path: dir.to_string_lossy().to_string(),
                size_bytes,
                size_display: format_size(size_bytes),
            });
        }
    }

    Ok(results)
}

#[command]
pub fn save_installation(
    path: String,
    name: String,
    version: String,
    start_params: String,
) -> Result<(), UiError> {
    let dir = PathBuf::from(&path);
    let info = InstallationInfo {
        name,
        version,
        start_params,
    };
    write_installation_json(&dir, &info)
}

#[command]
pub async fn initialize_game(path: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| UiError {
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
    pub save: Option<String>,
}

#[command]
pub async fn play_game(app: AppHandle, options: Option<PlayGameParams>) -> Result<String, UiError> {
    let options = options.ok_or_else(|| UiError {
        name: "invalid_params".into(),
        message: "Invalid play game parameters.".into(),
    })?;
    let (pb, installation) = find_installation_by_id(&app, options.installation_id)?;
    eprintln!("[play_game] installation dir: {:?}", pb);
    eprintln!(
        "[play_game] installation info: name={}, version={}, startParams={}",
        installation.name, installation.version, installation.start_params
    );

    // Ensure .NET runtime
    let app_data = app.path().app_data_dir().map_err(|e| UiError {
        name: "app_data_failed".into(),
        message: format!("Failed to get app data dir: {e}"),
    })?;
    let dotnet_root = dotnet::ensure_dotnet(
        &app,
        &app_data,
        &installation.version,
        options.installation_id,
    )
    .await?;
    eprintln!("[play_game] DOTNET_ROOT={:?}", dotnet_root);
    // Debug: show what's at DOTNET_ROOT
    if let Ok(entries) = std::fs::read_dir(&dotnet_root) {
        for e in entries.flatten() {
            eprintln!("[play_game]   {}", e.file_name().to_string_lossy());
        }
    }
    let hostfxr_dir = dotnet_root.join("host").join("fxr");
    eprintln!(
        "[play_game] hostfxr dir exists: {}, path: {:?}",
        hostfxr_dir.is_dir(),
        hostfxr_dir
    );
    if hostfxr_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&hostfxr_dir) {
            for e in entries.flatten() {
                eprintln!(
                    "[play_game]   fxr version: {}",
                    e.file_name().to_string_lossy()
                );
            }
        }
    }

    let subdir = versions_subdir(app.clone());
    let version_path = versions_folder(app.clone())
        .join(&subdir)
        .join(&installation.version);
    eprintln!("[play_game] version_path: {:?}", version_path);
    if !version_path.exists() || !version_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                version_path.to_string_lossy()
            ),
        });
    }
    let start_params = installation.start_params.as_str();
    let mut found_exe = false;
    let mut combined_path = PathBuf::from("/");
    for entry in WalkDir::new(&version_path) {
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
        eprintln!("[play_game] ERROR: exe not found in version_path");
        return Err(UiError::from(
            "Could not find Vintage Story executable in installation path",
        ));
    }
    eprintln!("[play_game] using exe: {:?}", combined_path);
    if !combined_path.exists() || !combined_path.is_file() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Launch file not found: {}", combined_path.to_string_lossy()),
        });
    }
    let account_result = app.zustand().get::<Value>("accounts", "selectedUser");
    let account = match account_result {
        Ok(val) if !val.is_null() => Some(val),
        _ => None,
    };

    if let Some(account) = account {
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
            let mut existing_json: Value = from_str(&existing_settings).unwrap_or(json!({}));
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
                let mods_path = pb.join("Mods").to_string_lossy().into_owned();
                if let Some(string_list_settings) = obj
                    .get_mut("stringListSettings")
                    .and_then(|v| v.as_object_mut())
                {
                    if let Some(mod_paths) = string_list_settings
                        .get_mut("modPaths")
                        .and_then(|v| v.as_array_mut())
                    {
                        *mod_paths = vec![json!(mods_path), json!("Mods")];
                    } else {
                        string_list_settings.insert("modPaths".into(), json!([mods_path, "Mods"]));
                    }
                } else {
                    obj.insert(
                        "stringListSettings".into(),
                        json!({ "modPaths": [mods_path, "Mods"] }),
                    );
                }
            }
            write(&settings_path, to_string_pretty(&existing_json).unwrap()).map_err(|e| {
                UiError {
                    name: "write_failed".into(),
                    message: format!("Failed to write clientsettings.json: {e}"),
                }
            })?;
        } else {
            create_dir_all(settings_path.parent().unwrap()).map_err(|e| UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory for clientsettings.json: {e}"),
            })?;
            write(&settings_path, to_string_pretty(&settings).unwrap()).map_err(|e| UiError {
                name: "write_failed".into(),
                message: format!("Failed to write clientsettings.json: {e}"),
            })?;
        }
    }
    // Emit a pre-launch event so the UI can show a loading state
    let _ = app.emit(
        &format!("launch-{}", options.installation_id),
        json!({ "status": "pending", "installationId": options.installation_id }),
    );

    // Build command with piped stdout/stderr so we can inspect output
    eprintln!(
        "[play_game] spawning: {:?} --dataPath {:?} DOTNET_ROOT={:?}",
        combined_path, pb, dotnet_root
    );
    let mut child = Command::new(&combined_path)
        .env("DOTNET_ROOT", &dotnet_root)
        .env("DOTNET_ROLL_FORWARD", "LatestMinor")
        .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .args(["--dataPath", &pb.as_path().to_string_lossy()])
        .args(
            options
                .save
                .as_ref()
                // Extract the file stem from the save path to use as the output file name. This prevents creating files with double extensions, e.g., "output.mp4.mp4".
                .map(|s| {
                    let save_path = Path::new(s);
                    let file_stem = save_path.file_stem().unwrap_or_default().to_string_lossy();
                    vec!["-o".to_string(), file_stem.to_string()]
                })
                .unwrap_or_default()
                .into_iter()
                .collect::<Vec<_>>(),
        )
        .args(
            options
                .server
                .as_ref()
                .map(|s| vec!["--connect", s.as_str()])
                .unwrap_or_default(),
        )
        .args(
            options
                .password
                .as_ref()
                .map(|p| vec!["--pw", p.as_str()])
                .unwrap_or_default(),
        )
        .args(start_params.split_whitespace().collect::<Vec<&str>>())
        .spawn()
        .map_err(|e| UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        })?;

    // Clone data needed inside watcher threads
    let app_handle = app.clone();
    let installation_id = options.installation_id;
    let target_prefix = "Client Notification] Game Version:"; // substring we look for
    let timeout = Duration::from_secs(25);
    let start_instant = Instant::now();

    // Combine stdout & stderr watching: spawn a thread per stream
    // Use an Arc flag to coordinate (optional simplification)
    let found_flag = Arc::new(AtomicBool::new(false));
    let found_flag_stdout = found_flag.clone();
    let found_flag_stderr = found_flag.clone();

    // Helper closure to parse line & emit success
    let emit_success = move |app_handle: &AppHandle, line: &str| {
        if let Some(idx) = line.find(target_prefix) {
            let version_part = line[idx + target_prefix.len()..].trim();
            let _ = app_handle.emit(
                &format!("launch-{}", installation_id),
                json!({
                    "status": "success",
                    "installationId": installation_id,
                    "version": version_part,
                    "line": line,
                }),
            );
            true
        } else {
            false
        }
    };

    // stdout watcher
    if let Some(stdout) = child.stdout.take() {
        let app_clone = app_handle.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                if found_flag_stdout.load(Ordering::SeqCst) {
                    break;
                }
                if start_instant.elapsed() > timeout {
                    break;
                }
                if let Ok(line) = line_res {
                    eprintln!("[play_game] stdout: {}", line);
                    if emit_success(&app_clone, &line) {
                        found_flag_stdout.store(true, Ordering::SeqCst);
                        break;
                    }
                } else {
                    break;
                }
            }
        });
    }
    // stderr watcher (some builds might log there)
    if let Some(stderr) = child.stderr.take() {
        let app_clone = app_handle.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line_res in reader.lines() {
                if found_flag_stderr.load(Ordering::SeqCst) {
                    break;
                }
                if start_instant.elapsed() > timeout {
                    break;
                }
                if let Ok(line) = line_res {
                    eprintln!("[play_game] stderr: {}", line);
                    if emit_success(&app_clone, &line) {
                        found_flag_stderr.store(true, Ordering::SeqCst);
                        break;
                    }
                } else {
                    break;
                }
            }
        });
    }

    // Timeout monitor thread: after timeout if not found emit failure.
    let app_for_timeout = app_handle.clone();
    thread::spawn(move || {
        while start_instant.elapsed() < timeout {
            if found_flag.load(Ordering::SeqCst) {
                return;
            }
            thread::sleep(Duration::from_millis(150));
        }
        if !found_flag.load(Ordering::SeqCst) {
            eprintln!("[play_game] TIMEOUT after {}ms", timeout.as_millis());
            let _ = app_for_timeout.emit(
                &format!("launch-{}", installation_id),
                json!({
                    "status": "error",
                    "installationId": installation_id,
                    "reason": "timeout",
                    "waitedMs": timeout.as_millis(),
                }),
            );
        }
    });
    Ok("started".into())
}

#[command]
pub fn reveal_in_file_explorer(path: String) -> Result<String, UiError> {
    let path = Path::new(&path);

    if cfg!(target_os = "windows") {
        // Validate path exists, create directory if needed
        if !path.exists() {
            // If path doesn't exist, it should be a directory - create it
            create_dir_all(path).map_err(|e| UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            })?;
        }

        // Now that we've ensured the path exists, open it
        if path.is_file() {
            // If it's a file, use /select to highlight it
            Command::new("explorer")
                .args(["/select,", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        } else if path.is_dir() {
            // If it's a directory, just open it
            Command::new("explorer")
                .arg(path.as_os_str().to_string_lossy().into_owned())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        } else {
            // This shouldn't happen after we created the directory, but handle it anyway
            return Err(UiError {
                name: "invalid_path".into(),
                message: format!("Path is neither a file nor directory: {}", path.display()),
            });
        }
    } else if cfg!(target_os = "macos") {
        // Validate path exists, create directory if needed
        if !path.exists() {
            create_dir_all(path).map_err(|e| UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            })?;
        }

        if path.is_dir() {
            Command::new("open")
                .arg(path.as_os_str())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        } else if path.is_file() {
            Command::new("open")
                .args(["-R", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        } else {
            return Err(UiError {
                name: "invalid_path".into(),
                message: format!("Path is neither a file nor directory: {}", path.display()),
            });
        }
    } else if cfg!(target_os = "linux") {
        // Validate path exists, create directory if needed
        if !path.exists() {
            create_dir_all(path).map_err(|e| UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            })?;
        }

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
pub fn remove_installation(app: AppHandle, id: u64) -> Result<String, UiError> {
    let (pb, _info) = find_installation_by_id(&app, id)?;
    if pb.exists() && pb.is_dir() {
        remove_dir_all(&pb).map_err(|e| UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove installation directory: {e}"),
        })?;
    }
    Ok("removed".into())
}

#[command]
pub async fn rename_installations_folder(
    app: AppHandle,
    source: String,
    new_name: String,
    subdir: String,
) -> Result<String, UiError> {
    let source_path = PathBuf::from(source)
        .join(installations_subdir(app))
        .join(&subdir);
    let destination_path = source_path
        .parent()
        .ok_or_else(|| UiError {
            name: "invalid_path".into(),
            message: "Source path has no parent directory".into(),
        })?
        .join(new_name);
    move_folder(source_path, destination_path)
}

#[command]
pub async fn move_installations_folder(
    source: String,
    destination: String,
    subdir: String,
) -> Result<String, UiError> {
    move_folder(
        PathBuf::from(source).join(&subdir),
        PathBuf::from(destination).join(&subdir),
    )?;
    Ok("moved".into())
}

#[command]
pub async fn remove_all_installations(source: String, subdir: String) -> Result<String, UiError> {
    let source_path = PathBuf::from(source).join(&subdir);
    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }
    remove_dir_all(&source_path).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove installations directory: {e}"),
    })?;
    Ok("removed".into())
}
