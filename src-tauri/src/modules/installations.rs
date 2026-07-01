use json5;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, write, File},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use walkdir::WalkDir;
use zip::ZipArchive;

use super::auth::SavedAccount;
use super::dotnet;
use super::errors::UiError;
use super::mods;
use super::paths::{self, clientsettings_path, installation_json_path, mods_dir};
use super::utils::{
    dir_name, dir_size, find_dir_by_id, format_size, generate_id, installations_folder,
    installations_subdir, move_folder, versions_folder, versions_subdir,
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
    pub icon: Option<String>,
    #[serde(default)]
    pub last_played: Option<u64>,
    #[serde(default)]
    pub total_time_played: u64,
    #[serde(default)]
    pub modpack_slug: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
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
    pub icon: Option<String>,
    pub last_played: Option<u64>,
    pub total_time_played: u64,
    pub modpack_slug: Option<String>,
    pub modpack_version: Option<String>,
    pub env_vars: HashMap<String, String>,
}
pub fn read_installation_json(dir: &Path) -> Result<InstallationInfo, UiError> {
    let file_path = installation_json_path(dir);
    if !file_path.exists() {
        return Err(UiError::not_found(format!(
            "installation.json not found in {}",
            dir.to_string_lossy()
        )));
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
    let file_path = installation_json_path(dir);
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
    if !installations_dir.is_dir() {
        return Err(UiError::not_found(format!(
            "Installation with id {} not found",
            id
        )));
    }

    let dir = find_dir_by_id(&installations_dir, id)?
        .ok_or_else(|| UiError::not_found(format!("Installation with id {} not found", id)))?;

    let name = dir_name(&dir);
    if installation_json_path(&dir).exists() {
        let info = read_installation_json(&dir)?;
        return Ok((dir, info));
    }
    // No installation.json but dir exists — treat as valid
    Ok((
        dir,
        InstallationInfo {
            name,
            version: String::new(),
            start_params: String::new(),
            favorite: false,
            icon: None,
            last_played: None,
            total_time_played: 0,
            modpack_slug: None,
            modpack_version: None,
            env_vars: HashMap::new(),
        },
    ))
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
            let has_mods = mods_dir(&dir).is_dir();
            let has_saves = dir.join(paths::SAVES_DIR).is_dir();
            let has_json = installation_json_path(&dir).exists();

            if !has_mods && !has_saves && !has_json {
                continue;
            }

            let info = if has_json {
                read_installation_json(&dir).unwrap_or_else(|_| InstallationInfo {
                    name: dir_name.clone(),
                    version: String::new(),
                    start_params: String::new(),
                    favorite: false,
                    icon: None,
                    last_played: None,
                    total_time_played: 0,
                    modpack_slug: None,
                    modpack_version: None,
                    env_vars: HashMap::new(),
                })
            } else {
                let info = InstallationInfo {
                    name: dir_name.clone(),
                    version: String::new(),
                    start_params: String::new(),
                    favorite: false,
                    icon: None,
                    last_played: None,
                    total_time_played: 0,
                    modpack_slug: None,
                    modpack_version: None,
                    env_vars: HashMap::new(),
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
                icon: info.icon.clone(),
                last_played: info.last_played,
                total_time_played: info.total_time_played,
                modpack_slug: info.modpack_slug,
                modpack_version: info.modpack_version,
                env_vars: info.env_vars.clone(),
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
    icon: Option<String>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<(), UiError> {
    log_info!(
        "save_installation: path={:?} name={:?} favorite={} icon={:?}",
        path,
        name,
        favorite,
        icon
    );
    let dir = PathBuf::from(&path);
    // Preserve existing playtime/modpack fields if the installation.json already exists
    let (last_played, total_time_played, modpack_slug, modpack_version, existing_env_vars) =
        read_installation_json(&dir)
            .map(|existing| {
                (
                    existing.last_played,
                    existing.total_time_played,
                    existing.modpack_slug,
                    existing.modpack_version,
                    existing.env_vars,
                )
            })
            .unwrap_or((None, 0, None, None, HashMap::new()));
    let info = InstallationInfo {
        name,
        version,
        start_params,
        favorite,
        icon,
        last_played,
        total_time_played,
        modpack_slug,
        modpack_version,
        env_vars: env_vars.unwrap_or(existing_env_vars),
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
        icon: None,
        last_played: None,
        total_time_played: 0,
        modpack_slug: modpack_slug.clone(),
        modpack_version: modpack_version.clone(),
        env_vars: HashMap::new(),
    };
    write_installation_json(&inst_dir, &info)?;

    // 3. Create Mods directory
    let mods_dir = super::paths::mods_dir(&inst_dir);
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

        let client = app.state::<Arc<reqwest::Client>>().clone();
        match mods::download_mod_file(&client, modid, version_str, &mods_dir).await {
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
        icon: None,
        last_played: None,
        total_time_played: 0,
        modpack_slug: modpack_slug.clone(),
        modpack_version: modpack_version.clone(),
        env_vars: info.env_vars.clone(),
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
    let pb = mods_dir(PathBuf::from(&path));
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
    let account = accounts
        .iter()
        .find(|a| a.selected)
        .or_else(|| accounts.first())
        .cloned();
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

    let ctx = resolve_launch_context(&app, &pb, &installation, &options).await?;
    prepare_clientsettings(&app, &pb, &installation, &options).await?;
    let _ = app.emit(
        &format!("launch-{}", options.installation_id),
        json!({ "status": "pending", "installationId": options.installation_id }),
    );
    let (child, expect_version_line) = spawn_game(&pb, &ctx, &installation, &options).await?;
    watch_process(
        &app,
        options.installation_id,
        pb,
        child,
        expect_version_line,
    )
    .await;

    log_info!(
        "play_game: process spawned for installation {}",
        options.installation_id
    );
    Ok("started".into())
}

/// Holds everything resolved before the game process is spawned.
struct LaunchContext {
    dotnet_root: PathBuf,
    combined_path: PathBuf,
    #[cfg(target_os = "macos")]
    app_bundle: Option<PathBuf>,
}

/// Resolve the launch context: .NET runtime, executable path, and macOS bundle.
async fn resolve_launch_context(
    app: &AppHandle,
    _pb: &Path,
    installation: &InstallationInfo,
    options: &PlayGameParams,
) -> Result<LaunchContext, UiError> {
    let app_data = app.path().app_data_dir().map_err(|e| {
        log_error!("installations: app_data_failed: {e}");
        UiError {
            name: "app_data_failed".into(),
            message: format!("Failed to get app data dir: {e}"),
        }
    })?;

    let dotnet_root = dotnet::ensure_dotnet(
        app,
        &app_data,
        &installation.version,
        options.installation_id,
        options.use_system_dotnet,
    )
    .await?;
    log_info!("[play_game] DOTNET_ROOT={:?}", dotnet_root);

    let subdir = versions_subdir(app.clone());
    let version_path = versions_folder(app.clone())
        .join(&subdir)
        .join(&installation.version);
    log_info!("[play_game] version_path: {:?}", version_path);
    if !version_path.exists() || !version_path.is_dir() {
        return Err(UiError::not_found(format!(
            "Version directory not found: {}",
            version_path.display()
        )));
    }

    let combined_path = find_game_executable(&version_path).await?;
    log_info!("[play_game] using exe: {:?}", combined_path);

    #[cfg(target_os = "macos")]
    let app_bundle = macos::resolve_app_bundle(&version_path, &combined_path).await?;
    #[cfg(not(target_os = "macos"))]
    let app_bundle = ();

    Ok(LaunchContext {
        dotnet_root,
        combined_path,
        #[cfg(target_os = "macos")]
        app_bundle,
    })
}

/// Search the version directory for the Vintage Story executable.
async fn find_game_executable(version_path: &Path) -> Result<PathBuf, UiError> {
    tokio::task::spawn_blocking({
        let version_path = version_path.to_path_buf();
        move || {
            let exe_name = paths::vintagestory_exe();

            #[cfg(target_os = "macos")]
            {
                // On macOS, prefer binaries inside a .app bundle.
                for entry in WalkDir::new(&version_path).min_depth(3).max_depth(4) {
                    let entry = entry.map_err(|e| {
                        log_error!("installations: walkdir error: {e}");
                        UiError::from(format!("walkdir error: {e}"))
                    })?;
                    if entry.file_type().is_file() {
                        let fname = entry.file_name().to_string_lossy();
                        if fname.eq_ignore_ascii_case(exe_name) {
                            let p = entry.path();
                            if macos::is_inside_app_bundle(p) {
                                return Ok(p.to_path_buf());
                            }
                        }
                    }
                }
            }

            // Fallback: search the whole version tree.
            for entry in WalkDir::new(&version_path) {
                let entry = entry.map_err(|e| {
                    log_error!("installations: walkdir error: {e}");
                    UiError::from(format!("walkdir error: {e}"))
                })?;
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy();
                    if fname.eq_ignore_ascii_case(exe_name) {
                        return Ok(entry.path().to_path_buf());
                    }
                }
            }

            Err(UiError::from(
                "Could not find Vintage Story executable in installation path",
            ))
        }
    })
    .await
    .map_err(|e| UiError::from(format!("spawn blocking error: {e}")))?
}

/// Write or update clientsettings.json for the launch.
async fn prepare_clientsettings(
    app: &AppHandle,
    pb: &Path,
    installation: &InstallationInfo,
    _options: &PlayGameParams,
) -> Result<(), UiError> {
    let account = load_selected_account(app);
    tokio::task::spawn_blocking({
        let pb = pb.to_path_buf();
        let installation = installation.clone();
        move || write_clientsettings(&pb, &installation, &account)
    })
    .await
    .map_err(|e| UiError::from(format!("spawn blocking error: {e}")))?
}

fn write_clientsettings(
    pb: &Path,
    _installation: &InstallationInfo,
    account: &Option<SavedAccount>,
) -> Result<(), UiError> {
    let settings_path = clientsettings_path(pb);
    log_info!("[play_game] clientsettings.json path: {:?}", settings_path);

    let mut settings_json: Value = if settings_path.exists() {
        log_info!("[play_game] reading existing clientsettings.json");
        let mut existing = String::new();
        File::open(&settings_path)
            .and_then(|mut f| f.read_to_string(&mut existing))
            .map_err(|e| {
                log_error!("installations: read_failed: {e}");
                UiError {
                    name: "read_failed".into(),
                    message: format!("Failed to read clientsettings.json: {e}"),
                }
            })?;
        from_str(&existing).unwrap_or(json!({}))
    } else {
        log_info!("[play_game] clientsettings.json does not exist — creating new");
        create_dir_all(settings_path.parent().unwrap()).map_err(|e| {
            log_error!("installations: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory for clientsettings.json: {e}"),
            }
        })?;
        json!({})
    };

    if let Some(obj) = settings_json.as_object_mut() {
        // Always set modPaths so Vintage Story picks up the Mods directory
        let mods_path = mods_dir(pb).to_string_lossy().into_owned();
        log_info!(
            "[play_game] setting modPaths in stringListSettings to [\"{}\", \"Mods\"]",
            mods_path
        );
        if let Some(string_list_settings) = obj
            .get_mut("stringListSettings")
            .and_then(|v| v.as_object_mut())
        {
            if let Some(mod_paths) = string_list_settings
                .get_mut("modPaths")
                .and_then(|v| v.as_array_mut())
            {
                *mod_paths = vec![json!(mods_path), json!("Mods")];
                log_info!("[play_game] updated existing modPaths");
            } else {
                string_list_settings.insert("modPaths".into(), json!([mods_path, "Mods"]));
                log_info!("[play_game] inserted modPaths into existing stringListSettings");
            }
        } else {
            obj.insert(
                "stringListSettings".into(),
                json!({ "modPaths": [mods_path, "Mods"] }),
            );
            log_info!("[play_game] created stringListSettings with modPaths");
        }

        // If an account is selected, merge its credentials into stringSettings
        if let Some(ref account) = account {
            log_info!(
                "[play_game] merging account settings — playername={:?} uid={}",
                account.playername,
                account.uid.as_deref().unwrap_or("<none>")
            );
            let account_settings = json!({
                "playeruid": account.uid.as_deref().unwrap_or(""),
                "sessionkey": account.sessionkey.as_deref().unwrap_or(""),
                "sessionsignature": account.sessionsignature.as_deref().unwrap_or(""),
                "playername": account.playername.as_deref().unwrap_or(""),
            });
            if let Some(string_settings) = obj
                .get_mut("stringSettings")
                .and_then(|v| v.as_object_mut())
            {
                for (k, v) in account_settings.as_object().unwrap() {
                    string_settings.insert(k.clone(), v.clone());
                }
                log_info!("[play_game] merged account keys into existing stringSettings");
            } else {
                obj.insert("stringSettings".into(), account_settings);
                log_info!("[play_game] inserted new stringSettings with account keys");
            }
        } else {
            log_info!(
                "[play_game] no selected account — writing modPaths only (no account injection)"
            );
        }
    }

    write(&settings_path, to_string_pretty(&settings_json).unwrap()).map_err(|e| {
        log_error!("installations: write_failed: {e}");
        UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        }
    })?;
    log_info!("[play_game] clientsettings.json written successfully");
    Ok(())
}

/// Spawn the game process and return the `Child` handle, plus whether we
/// should wait for a version line on stdout/stderr.
async fn spawn_game(
    pb: &Path,
    ctx: &LaunchContext,
    installation: &InstallationInfo,
    options: &PlayGameParams,
) -> Result<(tokio::process::Child, bool), UiError> {
    let start_params = installation.start_params.as_str();

    #[cfg(target_os = "macos")]
    let (child, expect_version_line) = if let Some(ref app_bundle) = ctx.app_bundle {
        (
            macos::spawn_via_open(
                app_bundle,
                pb,
                &ctx.dotnet_root,
                options,
                start_params,
                &installation.env_vars,
            )
            .await?,
            false,
        )
    } else {
        (
            spawn_direct(
                &ctx.combined_path,
                pb,
                &ctx.dotnet_root,
                options,
                start_params,
                &installation.env_vars,
            )
            .await?,
            true,
        )
    };

    #[cfg(not(target_os = "macos"))]
    let (child, expect_version_line) = (
        spawn_direct(
            &ctx.combined_path,
            pb,
            &ctx.dotnet_root,
            options,
            start_params,
            &installation.env_vars,
        )
        .await?,
        true,
    );

    Ok((child, expect_version_line))
}

async fn spawn_direct(
    exe: &Path,
    data_path: &Path,
    dotnet_root: &Path,
    options: &PlayGameParams,
    start_params: &str,
    env_vars: &HashMap<String, String>,
) -> Result<tokio::process::Child, UiError> {
    log_info!(
        "[play_game] SPAWNING direct: {:?} --dataPath {:?} DOTNET_ROOT={:?}",
        exe,
        data_path,
        dotnet_root
    );

    let mut cmd = tokio::process::Command::new(exe);
    cmd.env("DOTNET_ROOT", dotnet_root)
        .env("DOTNET_ROLL_FORWARD", "LatestMinor")
        .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
        .kill_on_drop(false)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in env_vars {
        cmd.env(key, value);
    }

    let mut args: Vec<String> = vec![
        "--dataPath".into(),
        data_path.to_string_lossy().into_owned(),
    ];

    if let Some(ref save) = options.save {
        let save_path = Path::new(save);
        let file_stem = save_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        args.push("-o".into());
        args.push(file_stem);
    }
    if let Some(ref server) = options.server {
        args.push("--connect".into());
        args.push(server.clone());
    }
    if let Some(ref password) = options.password {
        args.push("--pw".into());
        args.push(password.clone());
    }

    cmd.args(&args);
    cmd.args(start_params.split_whitespace().collect::<Vec<&str>>());

    cmd.spawn().map_err(|e| {
        log_error!("installations: launch_failed: {e}");
        UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        }
    })
}

/// Watch the launched process: emit success when the game reports its version,
/// emit timeout if it doesn't, and update playtime when it exits.
async fn watch_process(
    app: &AppHandle,
    installation_id: u64,
    installation_dir: PathBuf,
    mut child: tokio::process::Child,
    expect_version_line: bool,
) {
    let app = app.clone();
    tokio::spawn(async move {
        let target_prefix = "Client Notification] Game Version:";
        let timeout = Duration::from_secs(25);
        let start = Instant::now();

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let found = Arc::new(AtomicBool::new(false));

        if expect_version_line {
            let found_stdout = found.clone();
            let found_stderr = found.clone();
            let app_stdout = app.clone();
            let app_stderr = app.clone();

            // stdout watcher
            if let Some(stdout) = stdout {
                tokio::spawn(async move {
                    let reader = tokio::io::BufReader::new(stdout);
                    let mut lines = reader.lines();
                    while start.elapsed() < timeout {
                        if found_stdout.load(Ordering::Relaxed) {
                            break;
                        }
                        match lines.next_line().await {
                            Ok(Some(line)) => {
                                log_debug!("[play_game] stdout: {}", line);
                                if let Some(idx) = line.find(target_prefix) {
                                    let version = line[idx + target_prefix.len()..].trim();
                                    let _ = app_stdout.emit(
                                        &format!("launch-{installation_id}"),
                                        json!({
                                            "status": "success",
                                            "installationId": installation_id,
                                            "version": version,
                                            "line": line,
                                        }),
                                    );
                                    found_stdout.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                });
            }

            // stderr watcher
            if let Some(stderr) = stderr {
                tokio::spawn(async move {
                    let reader = tokio::io::BufReader::new(stderr);
                    let mut lines = reader.lines();
                    while start.elapsed() < timeout {
                        if found_stderr.load(Ordering::Relaxed) {
                            break;
                        }
                        match lines.next_line().await {
                            Ok(Some(line)) => {
                                log_debug!("[play_game] stderr: {}", line);
                                if let Some(idx) = line.find(target_prefix) {
                                    let version = line[idx + target_prefix.len()..].trim();
                                    let _ = app_stderr.emit(
                                        &format!("launch-{installation_id}"),
                                        json!({
                                            "status": "success",
                                            "installationId": installation_id,
                                            "version": version,
                                            "line": line,
                                        }),
                                    );
                                    found_stderr.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                });
            }

            // Timeout monitor
            tokio::spawn({
                let app = app.clone();
                let found = found.clone();
                async move {
                    tokio::time::sleep(timeout).await;
                    if !found.load(Ordering::Relaxed) {
                        log_error!("[play_game] TIMEOUT after {}ms", timeout.as_millis());
                        let _ = app.emit(
                            &format!("launch-{installation_id}"),
                            json!({
                                "status": "error",
                                "installationId": installation_id,
                                "reason": "timeout",
                                "waitedMs": timeout.as_millis(),
                            }),
                        );
                    }
                }
            });
        } else {
            // macOS .app bundles are launched via `open`; the game output is not
            // piped through, so report success immediately.
            let _ = app.emit(
                &format!("launch-{installation_id}"),
                json!({
                    "status": "success",
                    "installationId": installation_id,
                    "version": "launched via .app bundle",
                }),
            );
        }

        // Wait for exit and update playtime
        let start_time = Instant::now();
        match child.wait().await {
            Ok(exit_status) => {
                let elapsed = start_time.elapsed().as_secs();
                log_info!("[play_game] process exited with status: {:?}", exit_status);
                log_info!("[play_game] session duration: {}s", elapsed);
                update_installation_playtime(&installation_dir, installation_id, elapsed, &app);
            }
            Err(e) => {
                log_error!("[play_game] failed to wait for process: {e}");
            }
        }
    });
}

fn update_installation_playtime(
    installation_dir: &Path,
    installation_id: u64,
    elapsed: u64,
    app: &AppHandle,
) {
    match read_installation_json(installation_dir) {
        Ok(mut info) => {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            info.last_played = Some(now_ms);
            info.total_time_played += elapsed;
            let total = info.total_time_played;

            match write_installation_json(installation_dir, &info) {
                Ok(()) => {
                    let _ = app.emit(
                        &format!("game-quit-{installation_id}"),
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

/// macOS-specific launch helpers.
#[cfg(target_os = "macos")]
pub mod macos {
    use super::*;

    /// Returns true if `path` is located inside a `.app` bundle.
    pub fn is_inside_app_bundle(path: &Path) -> bool {
        let mut ancestor = path.parent();
        while let Some(dir) = ancestor {
            if dir.extension().map(|e| e == "app") == Some(true) {
                return true;
            }
            ancestor = dir.parent();
        }
        false
    }

    /// Resolve the .app bundle for the executable, restructuring old installs if needed.
    pub async fn resolve_app_bundle(
        version_path: &Path,
        combined_path: &Path,
    ) -> Result<Option<PathBuf>, UiError> {
        // Walk up from the binary to find any .app ancestor
        let mut app_ancestor: Option<&Path> = None;
        let mut ancestor = combined_path.parent();
        while let Some(dir) = ancestor {
            if dir.extension().map(|e| e == "app") == Some(true) {
                app_ancestor = Some(dir);
                break;
            }
            ancestor = dir.parent();
        }

        if let Some(existing) = app_ancestor {
            log_info!(
                "[play_game] macOS: using existing .app bundle at {:?}",
                existing
            );
            return Ok(Some(existing.to_path_buf()));
        }

        // No existing .app bundle. Restructure old installation if needed.
        let app_bundle = version_path.join("Vintage Story.app");
        if !app_bundle.exists() {
            log_info!(
                "[play_game] macOS: restructuring old installation into {:?}",
                app_bundle
            );
            restructure_into_app_bundle(version_path, &app_bundle).map_err(|e| {
                log_error!("[play_game] macOS: failed to restructure .app bundle: {e}");
                UiError::from(format!("Failed to restructure .app bundle: {e}"))
            })?;
        } else {
            log_info!(
                "[play_game] macOS: using previously restructured .app bundle at {:?}",
                app_bundle
            );
        }

        Ok(Some(app_bundle))
    }

    fn restructure_into_app_bundle(
        version_path: &Path,
        app_bundle: &Path,
    ) -> Result<(), std::io::Error> {
        std::fs::create_dir_all(app_bundle)?;

        if version_path.is_dir() {
            for entry in std::fs::read_dir(version_path)? {
                let entry = entry?;
                let src = entry.path();
                if src == app_bundle {
                    continue;
                }
                let dst = app_bundle.join(entry.file_name());
                std::fs::rename(&src, &dst)?;
            }
        }

        let plist = app_bundle.join("Info.plist");
        if !plist.exists() {
            log_error!(
                "[play_game] macOS: WARNING - no Info.plist in .app bundle after restructuring"
            );
        }

        Ok(())
    }

    /// Launch the game via `open` on macOS so Info.plist is read.
    pub async fn spawn_via_open(
        app_bundle: &Path,
        data_path: &Path,
        dotnet_root: &Path,
        options: &PlayGameParams,
        start_params: &str,
        _env_vars: &HashMap<String, String>,
    ) -> Result<tokio::process::Child, UiError> {
        log_info!(
            "[play_game] SPAWNING via open: open -W -a {:?} --args --dataPath {:?} DOTNET_ROOT={:?}",
            app_bundle,
            data_path,
            dotnet_root
        );

        let mut open_args: Vec<String> = vec![
            "--dataPath".to_string(),
            data_path.to_string_lossy().to_string(),
        ];

        if let Some(ref save) = options.save {
            let save_path = Path::new(save);
            let file_stem = save_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            open_args.push("-o".to_string());
            open_args.push(file_stem);
        }
        if let Some(ref server) = options.server {
            open_args.push("--connect".to_string());
            open_args.push(server.clone());
        }
        if let Some(ref password) = options.password {
            open_args.push("--pw".to_string());
            open_args.push(password.clone());
        }
        open_args.extend(start_params.split_whitespace().map(|s| s.to_string()));

        tokio::process::Command::new("open")
            .env("DOTNET_ROOT", dotnet_root)
            .env("DOTNET_ROLL_FORWARD", "LatestMinor")
            .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
            .kill_on_drop(false)
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
            })
    }
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
    let start = Instant::now();
    log_info!("remove_installation: id={}", id);
    let (pb, _info) = find_installation_by_id(&app, id)?;
    if pb.exists() && pb.is_dir() {
        let remove_dir_all_start = Instant::now();
        remove_dir_all(&pb).map_err(|e| {
            log_error!("installations: remove_failed: {e}");
            UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove installation directory: {e}"),
            }
        })?;
        log_info!(
            "remove_installation: id={}, remove_dir_all took {}ms",
            id,
            remove_dir_all_start.elapsed().as_millis(),
        );
    } else {
        log_info!("remove_installation: id={}, directory not found, no-op", id);
    }
    log_info!(
        "remove_installation: id={}, total command took {}ms",
        id,
        start.elapsed().as_millis(),
    );
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
