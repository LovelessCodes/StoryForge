use json5;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, write, File},
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
use zip::ZipArchive;

use super::auth::SavedAccount;
use super::dotnet;
use super::errors::UiError;
use super::mods;
use super::utils::{
    installations_folder, installations_subdir, move_folder, versions_folder, versions_subdir,
};
use crate::{log_debug, log_error, log_info};

// --- Installation JSON5 persistence ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallationInfo {
    pub name: String,
    pub version: String,
    #[serde(rename = "startParams")]
    pub start_params: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub last_played: Option<u64>,
    #[serde(default)]
    pub total_time_played: u64,
    #[serde(default)]
    pub modpack_slug: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
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
    pub favorite: bool,
    pub last_played: Option<u64>,
    pub total_time_played: u64,
    pub modpack_slug: Option<String>,
    pub modpack_version: Option<String>,
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
        create_dir_all(dir).map_err(|e| {
            log_error!("installations: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
        })?;
    }
    let file_path = dir.join("installation.json");
    let content = json5::to_string(info).map_err(|e| {
        log_error!("installations: serialize_failed: {e}");
        UiError {
            name: "serialize_failed".into(),
            message: format!("Failed to serialize installation.json: {e}"),
        }
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
    for entry in read_dir(&installations_dir).map_err(|e| {
        log_error!("installations: io_error: {e}");
        UiError {
            name: "io_error".into(),
            message: format!("Failed to read installations directory: {e}"),
        }
    })? {
        let entry = entry.map_err(|e| {
            log_error!("installations: io_error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            }
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
                favorite: false,
                last_played: None,
                total_time_played: 0,
                modpack_slug: None,
                modpack_version: None,
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
    log_info!("get_all_installations: scanning {:?}", installations_dir);

    // Ensure dir exists
    if !installations_dir.exists() {
        create_dir_all(&installations_dir).map_err(|e| {
            log_error!("installations: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create installations directory: {e}"),
            }
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
                            favorite: false,
                            last_played: None,
                            total_time_played: 0,
                            modpack_slug: None,
                            modpack_version: None,
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
        for entry in read_dir(&installations_dir).map_err(|e| {
            log_error!("installations: io_error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read installations directory: {e}"),
            }
        })? {
            let entry = entry.map_err(|e| {
                log_error!("installations: io_error: {e}");
                UiError {
                    name: "io_error".into(),
                    message: format!("Failed to read directory entry: {e}"),
                }
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
                    favorite: false,
                    last_played: None,
                    total_time_played: 0,
                    modpack_slug: None,
                    modpack_version: None,
                })
            } else {
                let info = InstallationInfo {
                    name: dir_name.clone(),
                    version: String::new(),
                    start_params: String::new(),
                    favorite: false,
                    last_played: None,
                    total_time_played: 0,
                    modpack_slug: None,
                    modpack_version: None,
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
                favorite: info.favorite,
                last_played: info.last_played,
                total_time_played: info.total_time_played,
                modpack_slug: info.modpack_slug,
                modpack_version: info.modpack_version,
            });
        }
    }

    let count = results.len();
    log_info!("get_all_installations: found {} installations", count);

    Ok(results)
}

#[command]
pub fn save_installation(
    path: String,
    name: String,
    version: String,
    start_params: String,
    favorite: bool,
) -> Result<(), UiError> {
    log_info!(
        "save_installation: path={:?} name={:?} favorite={}",
        path,
        name,
        favorite
    );
    let dir = PathBuf::from(&path);
    // Preserve existing playtime/modpack fields if the installation.json already exists
    let (last_played, total_time_played, modpack_slug, modpack_version) =
        read_installation_json(&dir)
            .map(|existing| {
                (
                    existing.last_played,
                    existing.total_time_played,
                    existing.modpack_slug,
                    existing.modpack_version,
                )
            })
            .unwrap_or((None, 0, None, None));
    let info = InstallationInfo {
        name,
        version,
        start_params,
        favorite,
        last_played,
        total_time_played,
        modpack_slug,
        modpack_version,
    };
    write_installation_json(&dir, &info)
}

#[command]
pub async fn import_installation(
    app: AppHandle,
    name: String,
    safe_name: String,
    version: String,
    start_params: String,
    mods: String,
    emitevent: String,
    modpack_slug: Option<String>,
    modpack_version: Option<String>,
    mod_config_url: Option<String>,
) -> Result<InstallationResult, UiError> {
    log_info!(
        "import_installation: name={} version={} mods={} mod_config_url={:?}",
        name,
        version,
        mods,
        mod_config_url
    );

    // 1. Create the installation directory
    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);
    let inst_dir = installations_dir.join(&safe_name);
    create_dir_all(&inst_dir).map_err(|e| UiError {
        name: "create_dir_failed".into(),
        message: format!("Failed to create installation directory: {e}"),
    })?;

    // 2. Write installation.json
    let info = InstallationInfo {
        name: name.clone(),
        version,
        start_params,
        favorite: false,
        last_played: None,
        total_time_played: 0,
        modpack_slug: modpack_slug.clone(),
        modpack_version: modpack_version.clone(),
    };
    write_installation_json(&inst_dir, &info)?;

    // 3. Create Mods directory
    let mods_dir = inst_dir.join("Mods");
    create_dir_all(&mods_dir).map_err(|e| UiError {
        name: "create_dir_failed".into(),
        message: format!("Failed to create Mods directory: {e}"),
    })?;

    // 4. Download and extract ModConfig zip if a URL is provided
    if let Some(ref config_url) = mod_config_url {
        if !config_url.is_empty() {
            log_info!(
                "import_installation: downloading ModConfig from {}",
                config_url
            );
            let config_zip_path = inst_dir.join("ModConfig.zip");
            let config_dir = inst_dir.join("ModConfig");

            // Download the zip
            let client = reqwest::Client::new();
            let resp = client.get(config_url).send().await.map_err(|e| UiError {
                name: "modconfig_download_failed".into(),
                message: format!("Failed to download ModConfig: {e}"),
            })?;

            if !resp.status().is_success() {
                return Err(UiError {
                    name: "modconfig_download_failed".into(),
                    message: format!("ModConfig download HTTP {}", resp.status()),
                });
            }

            let bytes = resp.bytes().await.map_err(|e| UiError {
                name: "modconfig_download_failed".into(),
                message: format!("Failed to read ModConfig body: {e}"),
            })?;

            // Save to temp zip file
            write(&config_zip_path, &bytes).map_err(|e| UiError {
                name: "modconfig_write_failed".into(),
                message: format!("Failed to write ModConfig zip: {e}"),
            })?;

            // Extract
            create_dir_all(&config_dir).map_err(|e| UiError {
                name: "modconfig_extract_failed".into(),
                message: format!("Failed to create ModConfig directory: {e}"),
            })?;

            let zip_file = File::open(&config_zip_path).map_err(|e| UiError {
                name: "modconfig_extract_failed".into(),
                message: format!("Failed to open ModConfig zip: {e}"),
            })?;

            let mut archive = ZipArchive::new(zip_file).map_err(|e| UiError {
                name: "modconfig_extract_failed".into(),
                message: format!("Failed to read ModConfig zip archive: {e}"),
            })?;

            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).map_err(|e| UiError {
                    name: "modconfig_extract_failed".into(),
                    message: format!("Failed to read zip entry {i}: {e}"),
                })?;
                let out_path = config_dir.join(entry.name());

                if entry.name().ends_with('/') {
                    create_dir_all(&out_path).map_err(|e| UiError {
                        name: "modconfig_extract_failed".into(),
                        message: format!("Failed to create dir in ModConfig: {e}"),
                    })?;
                } else {
                    if let Some(parent) = out_path.parent() {
                        create_dir_all(parent).map_err(|e| UiError {
                            name: "modconfig_extract_failed".into(),
                            message: format!("Failed to create parent dir in ModConfig: {e}"),
                        })?;
                    }
                    let mut out_file = File::create(&out_path).map_err(|e| UiError {
                        name: "modconfig_extract_failed".into(),
                        message: format!("Failed to create file in ModConfig: {e}"),
                    })?;
                    std::io::copy(&mut entry, &mut out_file).map_err(|e| UiError {
                        name: "modconfig_extract_failed".into(),
                        message: format!("Failed to extract file in ModConfig: {e}"),
                    })?;
                }
            }

            // Clean up the zip file
            let _ = std::fs::remove_file(&config_zip_path);

            log_info!(
                "import_installation: ModConfig extracted to {:?}",
                config_dir
            );
        }
    }

    let id = generate_id(&name);

    // 5. Parse mods: "modid@version,modid@version,..."
    let mod_entries: Vec<(&str, &str)> = mods
        .split(',')
        .filter_map(|entry| {
            let trimmed = entry.trim();
            if trimmed.is_empty() {
                return None;
            }
            let mut parts = trimmed.splitn(2, '@');
            let modid = parts.next().unwrap_or("");
            let version = parts.next().unwrap_or("");
            if modid.is_empty() || version.is_empty() {
                None
            } else {
                Some((modid, version))
            }
        })
        .collect();

    let total = mod_entries.len();
    log_info!("import_installation: {} mods to download", total);

    // 6. Download each mod with progress events
    let mut downloaded: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for (i, (modid, version_str)) in mod_entries.iter().enumerate() {
        let current = (i + 1) as u32;

        let _ = app.emit(
            &emitevent,
            json!({
                "phase": "downloading",
                "current": current,
                "total": total,
                "modid": modid,
                "version": version_str,
            }),
        );

        match mods::download_mod_file(modid, version_str, &mods_dir).await {
            Ok(filename) => {
                log_info!(
                    "import_installation: [{}/{}] downloaded {}@{}",
                    current,
                    total,
                    modid,
                    version_str
                );
                downloaded.push(filename);
            }
            Err(e) => {
                log_error!(
                    "import_installation: [{}/{}] failed {}@{}: {}",
                    current,
                    total,
                    modid,
                    version_str,
                    e.message
                );
                errors.push(format!("{}@{}: {}", modid, version_str, e.message));
            }
        }
    }

    let size_bytes = dir_size(&inst_dir);

    let result = InstallationResult {
        id,
        name: name.clone(),
        version: info.version.clone(),
        start_params: info.start_params.clone(),
        path: inst_dir.to_string_lossy().to_string(),
        size_bytes,
        size_display: format_size(size_bytes),
        favorite: false,
        last_played: None,
        total_time_played: 0,
        modpack_slug: modpack_slug.clone(),
        modpack_version: modpack_version.clone(),
    };

    let _ = app.emit(
        &emitevent,
        json!({
            "phase": "done",
            "installation": {
                "id": result.id,
                "name": result.name,
                "version": result.version,
                "path": result.path,
                "sizeDisplay": result.size_display,
            },
            "downloaded": downloaded.len(),
            "failed": errors.len(),
            "errors": errors,
        }),
    );

    log_info!(
        "import_installation: done — {} downloaded, {} failed",
        downloaded.len(),
        errors.len()
    );

    Ok(result)
}

#[command]
pub async fn initialize_game(path: String) -> Result<String, UiError> {
    log_info!("initialize_game: {:?}", path);
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| {
            log_error!("installations: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
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
    #[serde(default = "default_use_system_dotnet")]
    pub use_system_dotnet: bool,
}

fn default_use_system_dotnet() -> bool {
    true
}

fn load_selected_account(app: &AppHandle) -> Option<SavedAccount> {
    use std::fs::read_to_string;
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().ok()?;
    let path = data_dir.join("accounts.json");
    log_debug!("[play_game] load_selected_account: looking for {:?}", path);
    if !path.exists() {
        log_info!(
            "[play_game] load_selected_account: accounts.json not found — no account selected"
        );
        return None;
    }
    let json = match read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            log_error!(
                "[play_game] load_selected_account: failed to read accounts.json: {}",
                e
            );
            return None;
        }
    };
    let accounts: Vec<SavedAccount> = match serde_json::from_str(&json) {
        Ok(a) => a,
        Err(e) => {
            log_error!(
                "[play_game] load_selected_account: failed to parse accounts.json: {}",
                e
            );
            return None;
        }
    };
    let account = accounts.into_iter().next();
    match &account {
        Some(a) => log_info!(
            "[play_game] load_selected_account: found account playername={:?} uid={}",
            a.playername,
            a.uid.as_deref().unwrap_or("<none>")
        ),
        None => log_info!(
            "[play_game] load_selected_account: accounts.json has 0 entries — no account selected"
        ),
    }
    account
}

#[command]
pub async fn play_game(app: AppHandle, options: Option<PlayGameParams>) -> Result<String, UiError> {
    let options = options.ok_or_else(|| UiError {
        name: "invalid_params".into(),
        message: "Invalid play game parameters.".into(),
    })?;
    let (pb, installation) = find_installation_by_id(&app, options.installation_id)?;
    log_info!("[play_game] installation dir: {:?}", pb);
    log_info!(
        "[play_game] installation info: name={}, version={}, startParams={}",
        installation.name,
        installation.version,
        installation.start_params
    );

    // Ensure .NET runtime
    let app_data = app.path().app_data_dir().map_err(|e| {
        log_error!("installations: app_data_failed: {e}");
        UiError {
            name: "app_data_failed".into(),
            message: format!("Failed to get app data dir: {e}"),
        }
    })?;
    let dotnet_root = dotnet::ensure_dotnet(
        &app,
        &app_data,
        &installation.version,
        options.installation_id,
        options.use_system_dotnet,
    )
    .await?;
    log_info!("[play_game] DOTNET_ROOT={:?}", dotnet_root);
    // Debug: show what's at DOTNET_ROOT
    if let Ok(entries) = std::fs::read_dir(&dotnet_root) {
        for e in entries.flatten() {
            log_debug!("[play_game]   {}", e.file_name().to_string_lossy());
        }
    }
    let hostfxr_dir = dotnet_root.join("host").join("fxr");
    log_debug!(
        "[play_game] hostfxr dir exists: {}, path: {:?}",
        hostfxr_dir.is_dir(),
        hostfxr_dir
    );
    if hostfxr_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&hostfxr_dir) {
            for e in entries.flatten() {
                log_debug!(
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
    log_info!("[play_game] version_path: {:?}", version_path);
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

    // ── macOS: prefer .app bundles ──
    // On macOS, Vintage Story may be distributed as a .app bundle alongside
    // a raw binary. The .app bundle contains Info.plist which is essential for
    // proper macOS app behavior. We search for .app bundles first.
    #[cfg(target_os = "macos")]
    {
        for entry in WalkDir::new(&version_path).min_depth(3).max_depth(4) {
            let entry = entry.map_err(|e| {
                log_error!("installations: walkdir error: {e}");
                UiError::from(format!("walkdir error: {e}"))
            })?;
            if entry.file_type().is_file() {
                let fname = entry.file_name().to_string_lossy();
                if fname.eq_ignore_ascii_case("vintagestory")
                    || fname.eq_ignore_ascii_case("vintagestory.exe")
                {
                    // Check if this binary is inside a .app bundle
                    let p = entry.path();
                    if p.parent()
                        .map(|n| n.file_name().map(|f| f == "MacOS"))
                        .flatten()
                        == Some(true)
                        && p.parent()
                            .and_then(|m| m.parent())
                            .map(|c| c.file_name().map(|f| f == "Contents"))
                            .flatten()
                            == Some(true)
                    {
                        let bundle = p.parent().unwrap().parent().unwrap().parent().unwrap();
                        if bundle.extension().map(|e| e == "app") == Some(true) {
                            found_exe = true;
                            combined_path = entry.path().to_path_buf();
                            log_info!(
                                "[play_game] macOS: found exe inside .app bundle: {:?}",
                                combined_path
                            );
                            break;
                        }
                    }
                }
            }
        }
    }

    // ── Fallback: search for raw binary (all platforms) ──
    if !found_exe {
        for entry in WalkDir::new(&version_path) {
            let entry = entry.map_err(|e| {
                log_error!("installations: walkdir error: {e}");
                UiError::from(format!("walkdir error: {e}"))
            })?;
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
    }
    if !found_exe {
        log_error!("[play_game] ERROR: exe not found in version_path");
        return Err(UiError::from(
            "Could not find Vintage Story executable in installation path",
        ));
    }
    log_info!("[play_game] using exe: {:?}", combined_path);
    if !combined_path.exists() || !combined_path.is_file() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Launch file not found: {}", combined_path.to_string_lossy()),
        });
    }

    // ── macOS .app bundle detection ──
    // On macOS, Vintage Story must be launched as a .app bundle so that
    // Info.plist is read by LaunchServices. New downloads preserve the bundle
    // (no --strip-components=1). Old downloads need to be restructured.
    #[cfg(target_os = "macos")]
    let maybe_app_bundle: Option<std::path::PathBuf> = {
        // Walk up from the binary to find any .app ancestor
        let p: &std::path::Path = &combined_path;
        let mut app_ancestor: Option<&std::path::Path> = None;
        {
            let mut ancestor = p.parent();
            while let Some(dir) = ancestor {
                if dir.extension().map(|e| e == "app") == Some(true) {
                    app_ancestor = Some(dir);
                    break;
                }
                ancestor = dir.parent();
            }
        }
        let existing_bundle = app_ancestor.map(|b| b.to_path_buf());

        if existing_bundle.is_some() {
            log_info!(
                "[play_game] macOS: using existing .app bundle at {:?}",
                existing_bundle
            );
            existing_bundle
        } else {
            // No existing .app bundle. This is an old installation that was
            // extracted with --strip-components=1, flattening the .app wrapper.
            // We need to restructure it into a proper .app bundle.
            let app_bundle = version_path.join("Vintage Story.app");

            if !app_bundle.exists() {
                log_info!(
                    "[play_game] macOS: restructuring old installation into {:?}",
                    app_bundle
                );

                // Create the .app directory first (rename needs the parent to exist)
                if let Err(e) = std::fs::create_dir_all(&app_bundle) {
                    log_error!("[play_game] failed to create .app dir: {}", e);
                }

                // Move the existing Contents/ directory (if present) into the .app bundle.
                // This handles Info.plist, Resources/, MacOS/, etc. all at once.
                if version_path.is_dir() {
                    // Move each item from old Contents/ into new Contents/
                    if let Ok(entries) = std::fs::read_dir(&version_path) {
                        for entry in entries.flatten() {
                            if entry.path() == app_bundle {
                                continue;
                            }
                            let src = entry.path();
                            let fname = entry.file_name();
                            let dst = app_bundle.join(&fname);
                            log_info!("[play_game] macOS: moving {:?} -> {:?}", src, dst);
                            if let Err(e) = std::fs::rename(&src, &dst) {
                                log_error!("[play_game] failed to move {:?}: {}", src, e);
                            }
                        }
                    }
                }

                // Verify the .app now has a valid Info.plist
                let plist_in_app = app_bundle.join("Info.plist");
                if !plist_in_app.exists() {
                    log_error!(
                        "[play_game] macOS: WARNING - no Info.plist in .app bundle after restructuring"
                    );
                }

                log_info!(
                    "[play_game] macOS: restructured into .app bundle at {:?}, exe now {:?}",
                    app_bundle,
                    combined_path
                );
                Some(app_bundle)
            } else {
                // .app already exists from a previous restructuring
                log_info!(
                    "[play_game] macOS: using previously restructured .app bundle at {:?}",
                    app_bundle
                );
                // Update combined_path to the binary inside the bundle
                let binary_name = combined_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Vintagestory".into());
                let bundled_exe = app_bundle.join(&binary_name);
                if bundled_exe.is_file() {
                    combined_path = bundled_exe;
                }
                Some(app_bundle)
            }
        }
    };
    #[cfg(not(target_os = "macos"))]
    let maybe_app_bundle: Option<std::path::PathBuf> = None;
    log_info!("[play_game] attempting to load selected account…");
    let account = load_selected_account(&app);

    if let Some(account) = account {
        log_info!(
            "[play_game] writing account settings to clientsettings.json — playername={:?} uid={}",
            account.playername,
            account.uid.as_deref().unwrap_or("<none>")
        );
        let settings = json!({
            "stringSettings": {
                "playeruid": account.uid.as_deref().unwrap_or(""),
                "sessionkey": account.sessionkey.as_deref().unwrap_or(""),
                "sessionsignature": account.sessionsignature.as_deref().unwrap_or(""),
                "playername": account.playername.as_deref().unwrap_or(""),
            }
        });
        let settings_path = pb.join("clientsettings.json");
        log_info!("[play_game] clientsettings.json path: {:?}", settings_path);
        // It should create the file if it does not exist, but if it exists it should just overwrite the keys
        if settings_path.exists() {
            log_info!("[play_game] clientsettings.json exists — merging account keys into existing settings");
            let mut existing_settings = String::new();
            File::open(&settings_path)
                .and_then(|mut f| f.read_to_string(&mut existing_settings))
                .map_err(|e| {
                    log_error!("installations: read_failed: {e}");

                    UiError {
                        name: "read_failed".into(),

                        message: format!("Failed to read existing clientsettings.json: {e}"),
                    }
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
            log_info!("[play_game] clientsettings.json does not exist — creating new with account settings");
            create_dir_all(settings_path.parent().unwrap()).map_err(|e| {
                log_error!("installations: create_dir_failed: {e}");
                UiError {
                    name: "create_dir_failed".into(),
                    message: format!("Failed to create directory for clientsettings.json: {e}"),
                }
            })?;
            write(&settings_path, to_string_pretty(&settings).unwrap()).map_err(|e| {
                log_error!("installations: write_failed: {e}");
                UiError {
                    name: "write_failed".into(),
                    message: format!("Failed to write clientsettings.json: {e}"),
                }
            })?;
            log_info!(
                "[play_game] clientsettings.json created with account settings (playername={:?})",
                account.playername
            );
        }
    } else {
        log_info!(
            "[play_game] no selected account — skipping clientsettings.json account injection"
        );
    }
    // Emit a pre-launch event so the UI can show a loading state
    let _ = app.emit(
        &format!("launch-{}", options.installation_id),
        json!({ "status": "pending", "installationId": options.installation_id }),
    );

    // Build command with piped stdout/stderr so we can inspect output

    let mut child = if maybe_app_bundle.is_some() {
        // ── macOS: launch .app bundle via `open` so Info.plist is read ──
        let app_bundle = maybe_app_bundle.as_ref().unwrap();
        log_info!(
            "[play_game] SPAWNING via open: open -W -a {:?} --args --dataPath {:?} DOTNET_ROOT={:?}",
            app_bundle,
            pb,
            dotnet_root
        );
        let mut open_args: Vec<String> = vec![
            "--dataPath".to_string(),
            pb.as_path().to_string_lossy().to_string(),
        ];
        // -o flag for save output
        if let Some(ref save) = options.save {
            let save_path = Path::new(save);
            let file_stem = save_path.file_stem().unwrap_or_default().to_string_lossy();
            open_args.push("-o".to_string());
            open_args.push(file_stem.into_owned());
        }
        // --connect flag
        if let Some(ref server) = options.server {
            open_args.push("--connect".to_string());
            open_args.push(server.clone());
        }
        // --pw flag
        if let Some(ref password) = options.password {
            open_args.push("--pw".to_string());
            open_args.push(password.clone());
        }
        // start params
        open_args.extend(start_params.split_whitespace().map(|s| s.to_string()));

        log_info!("[play_game] open args: {:?}", open_args);

        Command::new("open")
            .env("DOTNET_ROOT", &dotnet_root)
            .env("DOTNET_ROLL_FORWARD", "LatestMinor")
            .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
            .arg("-W")
            .arg("-a")
            .arg(app_bundle)
            .arg("--args")
            .args(&open_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                log_error!("installations: launch_failed: {e}");
                UiError {
                    name: "launch_failed".into(),
                    message: format!("Failed to launch via open: {e}"),
                }
            })?

        // DOTNET_ROOT and other env vars are set on the `open` process above.
        // On modern macOS, LaunchServices forwards env vars to the launched app.
        // The .app bundle's own Info.plist (now being read!) may also set these.
    } else {
        // ── Direct binary launch (non-macOS or raw binary) ──
        log_info!(
            "[play_game] SPAWNING direct: {:?} --dataPath {:?} DOTNET_ROOT={:?}",
            combined_path,
            pb,
            dotnet_root
        );
        Command::new(&combined_path)
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
            .map_err(|e| {
                log_error!("installations: launch_failed: {e}");
                UiError {
                    name: "launch_failed".into(),
                    message: format!("Failed to launch: {e}"),
                }
            })?
    };

    // ── macOS .app bundle: emit success immediately ──
    // When launched via `open`, we can't read the game's stdout (it's detached),
    // so we emit success right away and skip the version-detection watchers.
    #[cfg(target_os = "macos")]
    if maybe_app_bundle.is_some() {
        let _ = app.emit(
            &format!("launch-{}", options.installation_id),
            json!({
                "status": "success",
                "installationId": options.installation_id,
                "version": "launched via .app bundle",
            }),
        );
    }

    // ── stdout/stderr watchers + exit tracking ──
    let app_handle = app.clone();
    let installation_id = options.installation_id;
    let target_prefix = "Client Notification] Game Version:"; // substring we look for
    let timeout = Duration::from_secs(25);
    let start_instant = Instant::now();

    // Combine stdout & stderr watching: spawn a thread per stream
    // Use an Arc flag to coordinate (optional simplification)
    // For macOS .app bundles, pre-set to true since we can't read the game's stdout.
    #[cfg(target_os = "macos")]
    let found_flag = Arc::new(AtomicBool::new(maybe_app_bundle.is_some()));
    #[cfg(not(target_os = "macos"))]
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
                    log_debug!("[play_game] stdout: {}", line);
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
                    log_debug!("[play_game] stderr: {}", line);
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
            log_error!("[play_game] TIMEOUT after {}ms", timeout.as_millis());
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

    // Wait for game process to exit and track playtime
    let app_for_exit = app_handle.clone();
    let installation_dir = pb.clone();
    let child_start = Instant::now();
    thread::spawn(move || match child.wait() {
        Ok(exit_status) => {
            log_info!("[play_game] process exited with status: {:?}", exit_status);
            let elapsed = child_start.elapsed().as_secs();
            log_info!("[play_game] session duration: {}s", elapsed);

            match read_installation_json(&installation_dir) {
                Ok(mut info) => {
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    info.last_played = Some(now_ms);
                    info.total_time_played += elapsed;
                    let total = info.total_time_played;

                    match write_installation_json(&installation_dir, &info) {
                        Ok(()) => {
                            let _ = app_for_exit.emit(
                                &format!("game-quit-{}", installation_id),
                                json!({
                                    "installationId": installation_id,
                                    "elapsedSeconds": elapsed,
                                    "lastPlayed": now_ms,
                                    "totalTimePlayed": total,
                                }),
                            );
                        }
                        Err(e) => {
                            log_error!(
                                "[play_game] failed to write installation.json: {}",
                                e.message
                            );
                        }
                    }
                }
                Err(e) => {
                    log_error!(
                        "[play_game] failed to read installation.json: {}",
                        e.message
                    );
                }
            }
        }
        Err(e) => {
            log_error!("[play_game] failed to wait for child: {}", e);
        }
    });

    log_info!(
        "play_game: process spawned for installation {}",
        options.installation_id
    );
    Ok("started".into())
}

#[command]
pub fn reveal_in_file_explorer(path: String) -> Result<String, UiError> {
    let path = Path::new(&path);

    if cfg!(target_os = "windows") {
        // Validate path exists, create directory if needed
        if !path.exists() {
            // If path doesn't exist, it should be a directory - create it
            create_dir_all(path).map_err(|e| {
                log_error!("installations: create_dir_failed: {e}");
                UiError {
                    name: "create_dir_failed".into(),
                    message: format!("Failed to create directory: {e}"),
                }
            })?;
        }

        // Now that we've ensured the path exists, open it
        if path.is_file() {
            // If it's a file, use /select to highlight it
            Command::new("explorer")
                .args(["/select,", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| {
                    log_error!("installations: Failed to open explorer: {e}");

                    UiError::from(format!("Failed to open explorer: {e}"))
                })?;
        } else if path.is_dir() {
            // If it's a directory, just open it
            Command::new("explorer")
                .arg(path.as_os_str().to_string_lossy().into_owned())
                .status()
                .map_err(|e| {
                    log_error!("installations: Failed to open explorer: {e}");

                    UiError::from(format!("Failed to open explorer: {e}"))
                })?;
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
            create_dir_all(path).map_err(|e| {
                log_error!("installations: create_dir_failed: {e}");
                UiError {
                    name: "create_dir_failed".into(),
                    message: format!("Failed to create directory: {e}"),
                }
            })?;
        }

        if path.is_dir() {
            Command::new("open")
                .arg(path.as_os_str())
                .status()
                .map_err(|e| {
                    log_error!("installations: Failed to open Finder: {e}");

                    UiError::from(format!("Failed to open Finder: {e}"))
                })?;
        } else if path.is_file() {
            Command::new("open")
                .args(["-R", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| {
                    log_error!("installations: Failed to open Finder: {e}");

                    UiError::from(format!("Failed to open Finder: {e}"))
                })?;
        } else {
            return Err(UiError {
                name: "invalid_path".into(),
                message: format!("Path is neither a file nor directory: {}", path.display()),
            });
        }
    } else if cfg!(target_os = "linux") {
        // Validate path exists, create directory if needed
        if !path.exists() {
            create_dir_all(path).map_err(|e| {
                log_error!("installations: create_dir_failed: {e}");
                UiError {
                    name: "create_dir_failed".into(),
                    message: format!("Failed to create directory: {e}"),
                }
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
    log_info!("remove_installation: id={}", id);
    let (pb, _info) = find_installation_by_id(&app, id)?;
    if pb.exists() && pb.is_dir() {
        remove_dir_all(&pb).map_err(|e| {
            log_error!("installations: remove_failed: {e}");
            UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove installation directory: {e}"),
            }
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
    log_info!(
        "rename_installations_folder: {:?} -> {:?}",
        source_path,
        destination_path
    );
    move_folder(source_path, destination_path)
}

#[command]
pub async fn move_installations_folder(
    source: String,
    destination: String,
    subdir: String,
) -> Result<String, UiError> {
    let src = PathBuf::from(&source).join(&subdir);
    let dst = PathBuf::from(&destination).join(&subdir);
    log_info!("move_installations_folder: {:?} -> {:?}", src, dst);
    move_folder(src, dst)?;
    log_info!("move_installations_folder: done");
    Ok("moved".into())
}

#[command]
pub async fn remove_all_installations(source: String, subdir: String) -> Result<String, UiError> {
    let source_path = PathBuf::from(source).join(&subdir);
    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }
    log_info!("remove_all_installations: {:?}", source_path);
    remove_dir_all(&source_path).map_err(|e| {
        log_error!("installations: remove_failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove installations directory: {e}"),
        }
    })?;
    Ok("removed".into())
}

// ── Installation log files ──

#[derive(Debug, Clone, Serialize)]
pub struct InstallationLog {
    pub name: String,
    pub size_bytes: u64,
    pub path: String,
}

#[command]
pub fn get_installation_logs(installation_path: String) -> Result<Vec<InstallationLog>, UiError> {
    let logs_dir = PathBuf::from(&installation_path).join("Logs");
    let mut logs = Vec::new();
    if !logs_dir.is_dir() {
        return Ok(logs);
    }
    for entry in read_dir(&logs_dir).map_err(|e| {
        log_error!("get_installation_logs: read_dir failed: {e}");
        UiError {
            name: "io_error".into(),
            message: format!("Failed to read Logs directory: {e}"),
        }
    })? {
        let entry = entry.map_err(|e| {
            log_error!("get_installation_logs: entry error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read log entry: {e}"),
            }
        })?;
        let path = entry.path();
        if path.is_file() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let size = path.metadata().map(|m| m.len()).unwrap_or(0);
            logs.push(InstallationLog {
                name,
                size_bytes: size,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(logs)
}

#[command]
pub fn read_installation_log(log_path: String) -> Result<String, UiError> {
    read_to_string(&log_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read log file: {e}"),
    })
}

/// Zip up the ModConfig folder from an installation and return the bytes.
#[command]
pub fn zip_modconfig(installation_path: String) -> Result<Vec<u8>, UiError> {
    let modconfig_dir = PathBuf::from(&installation_path).join("ModConfig");
    if !modconfig_dir.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("ModConfig directory not found: {:?}", modconfig_dir),
        });
    }

    let mut buf = Vec::new();
    {
        let mut zip_writer = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for entry in walkdir::WalkDir::new(&modconfig_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let relative = path.strip_prefix(&modconfig_dir).map_err(|e| UiError {
                name: "zip_failed".into(),
                message: format!("Failed to strip prefix: {e}"),
            })?;
            let name = relative.to_string_lossy().to_string();

            zip_writer.start_file(&name, options).map_err(|e| UiError {
                name: "zip_failed".into(),
                message: format!("Failed to write zip entry: {e}"),
            })?;

            let mut file = File::open(path).map_err(|e| UiError {
                name: "zip_failed".into(),
                message: format!("Failed to open file for zip: {e}"),
            })?;
            std::io::copy(&mut file, &mut zip_writer).map_err(|e| UiError {
                name: "zip_failed".into(),
                message: format!("Failed to copy file to zip: {e}"),
            })?;
        }

        zip_writer.finish().map_err(|e| UiError {
            name: "zip_failed".into(),
            message: format!("Failed to finalize zip: {e}"),
        })?;
    }

    log_info!("zip_modconfig: {:?} → {} bytes", modconfig_dir, buf.len());
    Ok(buf)
}
