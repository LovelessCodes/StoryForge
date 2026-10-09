use json5;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, write, File},
    io::Read,
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use walkdir::WalkDir;
use zip::ZipArchive;

use super::auth::SavedAccount;
use super::backups;
use super::dotnet;
use super::errors::UiError;
use super::game_defaults;
use super::mods;
use super::packs::{self, PackLock};
use super::paths::{self, clientsettings_path, mods_dir, profile_json_path};
use super::utils::{
    dir_name, dir_size, dir_size_cached, find_dir_by_id, format_size, generate_id, lock,
    move_folder, normalize_path, parse_start_params, profiles_folder, profiles_subdir,
    require_managed_path, require_safe_destination, safe_join,
};
use crate::{log_debug, log_error, log_info};

/// Profiles with a game process launched by the app still alive. Backups and
/// restores refuse to touch a profile while it is running.
static RUNNING_PROFILES: LazyLock<Mutex<std::collections::HashSet<u64>>> =
    LazyLock::new(Default::default);

/// Marks a profile as running (game process alive) or not.
pub fn mark_profile_running(profile_id: u64, running: bool) {
    let mut profiles = lock(&RUNNING_PROFILES);
    if running {
        profiles.insert(profile_id);
    } else {
        profiles.remove(&profile_id);
    }
}

/// True while a game launched by the app is still running for this profile.
pub fn is_profile_running(profile_id: u64) -> bool {
    lock(&RUNNING_PROFILES).contains(&profile_id)
}

// --- Profile JSON5 persistence ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileInfo {
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
    /// Create a backup before the game launches.
    #[serde(default)]
    pub backup_on_play: bool,
    /// Keep at most this many backups (0 keeps them all).
    #[serde(default = "default_backup_limit")]
    pub backup_limit: u32,
    /// Skip the shared game defaults when this profile launches.
    #[serde(default)]
    pub ignore_game_defaults: bool,
}

fn default_backup_limit() -> u32 {
    5
}

impl Default for ProfileInfo {
    fn default() -> Self {
        Self {
            name: String::new(),
            version: String::new(),
            start_params: String::new(),
            favorite: false,
            icon: None,
            last_played: None,
            total_time_played: 0,
            modpack_slug: None,
            modpack_version: None,
            env_vars: HashMap::new(),
            backup_on_play: false,
            backup_limit: default_backup_limit(),
            ignore_game_defaults: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileResult {
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
    /// True for profiles that live outside the profiles root (adopted game
    /// data directories registered in `external-profiles.json`).
    #[serde(default)]
    pub external: bool,
    /// Create a backup before the game launches.
    #[serde(default)]
    pub backup_on_play: bool,
    /// Keep at most this many backups (0 keeps them all).
    #[serde(default)]
    pub backup_limit: u32,
    /// Skip the shared game defaults when this profile launches.
    #[serde(default)]
    pub ignore_game_defaults: bool,
}
pub fn read_profile_json(dir: &Path) -> Result<ProfileInfo, UiError> {
    let file_path = profile_json_path(dir);
    if !file_path.exists() {
        return Err(UiError::not_found(format!(
            "profile.json not found in {}",
            dir.to_string_lossy()
        )));
    }
    let content = std::fs::read_to_string(&file_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read {}: {e}", file_path.to_string_lossy()),
    })?;
    let info: ProfileInfo = json5::from_str(&content).map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(info)
}

pub fn write_profile_json(dir: &Path, info: &ProfileInfo) -> Result<(), UiError> {
    if !dir.exists() {
        create_dir_all(dir).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
        })?;
    }
    let file_path = profile_json_path(dir);
    let content = json5::to_string(info).map_err(|e| {
        log_error!("profiles: serialize_failed: {e}");
        UiError {
            name: "serialize_failed".into(),
            message: format!("Failed to serialize profile.json: {e}"),
        }
    })?;
    write(&file_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(())
}

/// Builds the ID of an profile from its on-disk directory name.
///
/// The ID must agree with `find_profile_by_id`, which hashes directory
/// names, so the sanitized folder name is the single source of truth — never
/// the display name (the two can differ, e.g. "My World" vs "my_world").
fn profile_id_for_dir(dir: &Path) -> u64 {
    generate_id(&dir_name(dir))
}

/// File in the app data dir listing profile directories that live outside
/// the profiles root (adopted game data folders).
const EXTERNAL_PROFILES_FILE: &str = "external-profiles.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct ExternalProfilesFile {
    #[serde(default)]
    paths: Vec<String>,
}

fn external_profiles_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(EXTERNAL_PROFILES_FILE))
}

/// Registered external profile directories (existing ones only).
pub fn external_profile_paths(app: &AppHandle) -> Vec<PathBuf> {
    external_profiles_path(app)
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str::<ExternalProfilesFile>(&content).ok())
        .map(|file| {
            file.paths
                .into_iter()
                .map(PathBuf::from)
                .filter(|path| path.is_dir())
                .collect()
        })
        .unwrap_or_default()
}

/// Replaces the registry of external profile directories.
pub fn set_external_profile_paths(app: &AppHandle, paths: &[PathBuf]) -> Result<(), UiError> {
    let Some(file_path) = external_profiles_path(app) else {
        return Err(UiError::new(
            "path_error",
            "Failed to resolve the app data dir",
        ));
    };
    let file = ExternalProfilesFile {
        paths: paths
            .iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect(),
    };
    let content = serde_json::to_string_pretty(&file)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
    write(&file_path, content)
        .map_err(|e| UiError::new("write_failed", format!("Failed to write registry: {e}")))
}

/// Returns true when `dir` is a registered external profile folder.
pub fn is_external_profile_dir(app: &AppHandle, dir: &Path) -> bool {
    let normalized = normalize_path(dir);
    external_profile_paths(app)
        .iter()
        .any(|path| normalize_path(path) == normalized)
}

/// Every profile directory: the profiles root's folders plus registered
/// external ones (deduplicated, hidden folders skipped).
pub fn all_profile_dirs(app: &AppHandle) -> Result<Vec<PathBuf>, UiError> {
    let root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let mut dirs: Vec<PathBuf> = Vec::new();
    if root.is_dir() {
        for entry in read_dir(&root)
            .map_err(|e| UiError::new("io_error", format!("Failed to read profiles folder: {e}")))?
        {
            let Ok(entry) = entry else { continue };
            let dir = entry.path();
            if dir.is_dir() && !entry.file_name().to_string_lossy().starts_with('.') {
                dirs.push(dir);
            }
        }
    }
    for external in external_profile_paths(app) {
        if !dirs
            .iter()
            .any(|dir| normalize_path(dir) == normalize_path(&external))
        {
            dirs.push(external);
        }
    }
    Ok(dirs)
}

pub fn find_profile_by_id(app: &AppHandle, id: u64) -> Result<(PathBuf, ProfileInfo), UiError> {
    let subdir = profiles_subdir(app.clone());
    let profiles_dir = profiles_folder(app.clone())?.join(&subdir);
    if profiles_dir.is_dir() {
        if let Some(dir) = find_dir_by_id(&profiles_dir, id)? {
            return Ok((dir.clone(), profile_info_for_dir(&dir)));
        }
    }

    // Adopted game data directories keep their profile.json outside the
    // profiles root; look them up through the registry.
    for external in external_profile_paths(app) {
        if generate_id(&dir_name(&external)) == id {
            return Ok((external.clone(), profile_info_for_dir(&external)));
        }
    }

    Err(UiError::not_found(format!(
        "Profile with id {} not found",
        id
    )))
}

/// Reads an profile's metadata, falling back to a folder-name profile.
fn profile_info_for_dir(dir: &Path) -> ProfileInfo {
    if profile_json_path(dir).exists() {
        if let Ok(info) = read_profile_json(dir) {
            return info;
        }
    }
    ProfileInfo {
        name: dir_name(dir),
        ..Default::default()
    }
}

#[command]
pub async fn get_all_profiles(app: AppHandle) -> Result<Vec<ProfileResult>, UiError> {
    let subdir = profiles_subdir(app.clone());
    let profiles_dir = profiles_folder(app.clone())?.join(&subdir);
    log_info!("get_all_profiles: scanning {:?}", profiles_dir);

    // Walks every profile (and its files) on disk: keep it off the UI thread.
    let mut results = tokio::task::spawn_blocking(move || scan_profiles(&profiles_dir))
        .await
        .map_err(|e| {
            log_error!("profiles: scan task failed: {e}");
            UiError::new("internal_error", format!("Profiles scan failed: {e}"))
        })??;

    // Adopted game data directories live outside the profiles root and are
    // tracked in the external-profiles registry.
    let existing: Vec<PathBuf> = results
        .iter()
        .map(|result| normalize_path(Path::new(&result.path)))
        .collect();
    for external in external_profile_paths(&app) {
        if existing.contains(&normalize_path(&external)) {
            continue;
        }
        let info = profile_info_for_dir(&external);
        let size_bytes = dir_size_cached(&external);
        log_info!(
            "get_all_profiles: including external profile {:?}",
            external
        );
        results.push(ProfileResult {
            id: generate_id(&dir_name(&external)),
            name: info.name,
            version: info.version,
            start_params: info.start_params,
            path: external.to_string_lossy().to_string(),
            size_bytes,
            size_display: format_size(size_bytes),
            favorite: info.favorite,
            icon: info.icon,
            last_played: info.last_played,
            total_time_played: info.total_time_played,
            modpack_slug: info.modpack_slug,
            modpack_version: info.modpack_version,
            env_vars: info.env_vars,
            external: true,
            backup_on_play: info.backup_on_play,
            backup_limit: info.backup_limit,
            ignore_game_defaults: info.ignore_game_defaults,
        });
    }

    Ok(results)
}

/// Blocking scan behind `get_all_profiles`.
fn scan_profiles(profiles_dir: &Path) -> Result<Vec<ProfileResult>, UiError> {
    // Ensure dir exists
    if !profiles_dir.exists() {
        create_dir_all(profiles_dir).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create profiles directory: {e}"),
            }
        })?;
    }

    // --- Scan directories ---
    let mut results: Vec<ProfileResult> = Vec::new();
    if profiles_dir.is_dir() {
        for entry in read_dir(profiles_dir).map_err(|e| {
            log_error!("profiles: io_error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read profiles directory: {e}"),
            }
        })? {
            let entry = entry.map_err(|e| {
                log_error!("profiles: io_error: {e}");
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
            // Skip dot-folders such as `.deleted` (soft-deleted profiles) and
            // any other hidden bookkeeping directories.
            if dir_name.starts_with('.') {
                continue;
            }
            let id = generate_id(&dir_name);

            // Check if it looks like an profile (has Mods dir or profile.json)
            let has_mods = mods_dir(&dir).is_dir();
            let has_saves = dir.join(paths::SAVES_DIR).is_dir();
            let has_json = profile_json_path(&dir).exists();

            if !has_mods && !has_saves && !has_json {
                continue;
            }

            let info = if has_json {
                read_profile_json(&dir).unwrap_or_else(|_| ProfileInfo {
                    name: dir_name.clone(),
                    ..Default::default()
                })
            } else {
                let info = ProfileInfo {
                    name: dir_name.clone(),
                    ..Default::default()
                };
                let _ = write_profile_json(&dir, &info);
                info
            };

            let size_bytes = dir_size_cached(&dir);
            results.push(ProfileResult {
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
                external: false,
                backup_on_play: info.backup_on_play,
                backup_limit: info.backup_limit,
                ignore_game_defaults: info.ignore_game_defaults,
            });
        }
    }

    let count = results.len();
    log_info!("get_all_profiles: found {} profiles", count);

    Ok(results)
}

#[command]
pub fn save_profile(
    path: String,
    name: String,
    version: String,
    start_params: String,
    favorite: bool,
    icon: Option<String>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<(), UiError> {
    log_info!(
        "save_profile: path={:?} name={:?} favorite={} icon={:?}",
        path,
        name,
        favorite,
        icon
    );
    let dir = PathBuf::from(&path);
    // Preserve existing playtime/modpack fields if the profile.json already exists
    let (
        last_played,
        total_time_played,
        modpack_slug,
        modpack_version,
        existing_env_vars,
        backup_on_play,
        backup_limit,
        existing_ignore_game_defaults,
    ) = read_profile_json(&dir)
        .map(|existing| {
            (
                existing.last_played,
                existing.total_time_played,
                existing.modpack_slug,
                existing.modpack_version,
                existing.env_vars,
                existing.backup_on_play,
                existing.backup_limit,
                existing.ignore_game_defaults,
            )
        })
        .unwrap_or((
            None,
            0,
            None,
            None,
            HashMap::new(),
            false,
            default_backup_limit(),
            false,
        ));
    let info = ProfileInfo {
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
        backup_on_play,
        backup_limit,
        ignore_game_defaults: existing_ignore_game_defaults,
    };
    write_profile_json(&dir, &info)
}

/// Persists the per-profile game-defaults opt-out without touching the rest of
/// the profile (the dialog rewrites everything else through `save_profile`).
#[command]
pub fn set_profile_game_defaults(
    app: AppHandle,
    profile_id: u64,
    ignore_game_defaults: bool,
) -> Result<(), UiError> {
    let (dir, mut info) = find_profile_by_id(&app, profile_id)?;
    info.ignore_game_defaults = ignore_game_defaults;
    write_profile_json(&dir, &info)
}

/// Persists the per-profile backup settings without touching the rest of the
/// profile (the dialog rewrites everything else through `save_profile`).
#[command]
pub fn set_profile_backup_settings(
    app: AppHandle,
    profile_id: u64,
    backup_on_play: bool,
    backup_limit: u32,
) -> Result<(), UiError> {
    let (dir, mut info) = find_profile_by_id(&app, profile_id)?;
    info.backup_on_play = backup_on_play;
    info.backup_limit = backup_limit.min(backups::MAX_BACKUP_LIMIT);
    write_profile_json(&dir, &info)
}

/// One mod entry from a structured (manifestVersion 1) modpack manifest.
/// Only the fields the installer acts on are modeled; unknown fields ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestModParam {
    pub mod_id_str: String,
    pub mod_version: String,
    pub filename: String,
    pub url: String,
    #[serde(default)]
    pub sha256: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    /// Where the mod runs. `"server"` entries belong to a hosted server, not
    /// to the client profile this command installs.
    #[serde(default)]
    pub side: Option<String>,
    /// ModDB compatibility with the pack's game version, when resolved.
    /// `Some(false)` would break the pack, so the entry is left out.
    #[serde(default)]
    pub compatible: Option<bool>,
}

/// Why a manifest entry is not installed into a client profile, if it isn't.
fn manifest_skip_reason(entry: &ManifestModParam) -> Option<&'static str> {
    if entry.side.as_deref() == Some("server") {
        return Some("server-side mod");
    }
    if entry.compatible == Some(false) {
        return Some("not compatible with the selected game version");
    }
    None
}

/// Rejects an import folder name that is not a single plain path component.
///
/// Imports arrive from files and share codes, so a name that could escape the
/// profiles root (`..`, absolute paths, separators, control characters) is
/// rejected instead of being silently rewritten.
fn require_import_folder_name(safe_name: &str) -> Result<(), UiError> {
    let mut components = Path::new(safe_name).components();
    let single_component =
        matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
    let invalid_chars = safe_name
        .chars()
        .any(|c| c.is_control() || matches!(c, '/' | '\\'));

    if !single_component || invalid_chars {
        return Err(UiError::new(
            "invalid_name",
            format!("Invalid profile folder name: {safe_name}"),
        ));
    }
    Ok(())
}

/// True when a folder holds nothing but the `Mods` directory that
/// `initialize_game` creates for a fresh install.
///
/// The modpack install flow initializes the folder before importing into it, so
/// that skeleton must not be mistaken for a re-import over an existing profile.
fn is_fresh_install_dir(dir: &Path) -> bool {
    let Ok(entries) = read_dir(dir) else {
        return false;
    };
    let mut names = entries
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().to_string());

    names.next().as_deref() == Some(paths::MODS_DIR)
        && names.next().is_none()
        && mods_dir(dir).is_dir()
}

/// Arguments for [`import_profile`].
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProfileParams {
    pub name: String,
    pub safe_name: String,
    pub version: String,
    pub start_params: String,
    pub mods: String,
    pub emitevent: String,
    #[serde(default)]
    pub modpack_slug: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
    #[serde(default)]
    pub mod_config_url: Option<String>,
    /// Structured mod list (manifestVersion 1). When absent/empty the legacy
    /// `mods` string is used instead.
    #[serde(default)]
    pub manifest_mods: Option<Vec<ManifestModParam>>,
    #[serde(default)]
    pub mod_configs_sha256: Option<String>,
    /// A pack lock carried by the export. Written into the profile and enforced
    /// once the mods are installed.
    #[serde(default)]
    pub lock: Option<PackLock>,
}

#[command]
pub async fn import_profile(
    app: AppHandle,
    params: ImportProfileParams,
) -> Result<ProfileResult, UiError> {
    let ImportProfileParams {
        name,
        safe_name,
        version,
        start_params,
        mods,
        emitevent,
        modpack_slug,
        modpack_version,
        mod_config_url,
        manifest_mods,
        mod_configs_sha256,
        lock,
    } = params;
    log_info!(
        "import_profile: name={} version={} mods={} mod_config_url={:?}",
        name,
        version,
        mods,
        mod_config_url
    );

    // 1. Validate the folder name, then create the profile directory
    require_import_folder_name(&safe_name)?;
    let subdir = profiles_subdir(app.clone());
    let profiles_dir = profiles_folder(app.clone())?.join(&subdir);
    let inst_dir = profiles_dir.join(&safe_name);
    require_managed_path(&app, &inst_dir, "profile")?;

    // Importing over an existing folder would overwrite that profile's
    // profile.json, so refuse before anything is written.
    if inst_dir.exists() && !is_fresh_install_dir(&inst_dir) {
        return Err(UiError::new(
            "name_taken",
            format!("A profile named \"{name}\" already exists"),
        ));
    }

    create_dir_all(&inst_dir).map_err(|e| UiError {
        name: "create_dir_failed".into(),
        message: format!("Failed to create profile directory: {e}"),
    })?;

    // 2. Write profile.json
    let info = ProfileInfo {
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
        backup_on_play: false,
        backup_limit: default_backup_limit(),
        ignore_game_defaults: false,
    };
    write_profile_json(&inst_dir, &info)?;

    // 3. Create Mods directory
    let mods_dir = super::paths::mods_dir(&inst_dir);
    create_dir_all(&mods_dir).map_err(|e| UiError {
        name: "create_dir_failed".into(),
        message: format!("Failed to create Mods directory: {e}"),
    })?;

    // 4. Download and extract ModConfig zip if a URL is provided
    if let Some(ref config_url) = mod_config_url {
        if !config_url.is_empty() {
            log_info!("import_profile: downloading ModConfig from {}", config_url);
            let config_zip_path = inst_dir.join("ModConfig.zip");
            let config_dir = inst_dir.join(paths::MODCONFIG_DIR);

            // Download the zip with the shared client (consistent timeout/user agent).
            let client = app.state::<Arc<reqwest::Client>>().clone();
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

            if let Some(expected) = &mod_configs_sha256 {
                let actual = mods::sha256_hex(&bytes);
                if !actual.eq_ignore_ascii_case(expected) {
                    return Err(UiError {
                        name: "modconfig_hash_mismatch".into(),
                        message: format!(
                            "ModConfig sha256 mismatch: expected {expected}, got {actual}"
                        ),
                    });
                }
            }

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
                let out_path = safe_join(&config_dir, entry.name()).map_err(|e| UiError {
                    name: "modconfig_extract_failed".into(),
                    message: format!("Unsafe entry {}: {}", entry.name(), e.message),
                })?;

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

            log_info!("import_profile: ModConfig extracted to {:?}", config_dir);
        }
    }

    let id = profile_id_for_dir(&inst_dir);

    // 5. Download mods. Prefer structured manifest entries (exact URL +
    // sha256); fall back to the legacy "modid@version,..." list.
    let mut downloaded: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();
    let client = app.state::<Arc<reqwest::Client>>().clone();

    let manifest_mods = manifest_mods.filter(|entries| !entries.is_empty());
    if let Some(entries) = manifest_mods.as_ref() {
        let total = entries.len();
        log_info!("import_profile: {} manifest mods to download", total);

        for (i, entry) in entries.iter().enumerate() {
            let current = (i + 1) as u32;

            if let Some(reason) = manifest_skip_reason(entry) {
                log_info!(
                    "import_profile: skipping {}@{}: {}",
                    entry.mod_id_str,
                    entry.mod_version,
                    reason
                );
                skipped.push(format!(
                    "{}@{}: {reason}",
                    entry.mod_id_str, entry.mod_version
                ));
                continue;
            }

            let _ = app.emit(
                &emitevent,
                json!({
                    "phase": "downloading",
                    "current": current,
                    "total": total,
                    "modid": entry.mod_id_str,
                    "version": entry.mod_version,
                }),
            );

            match mods::download_manifest_mod_file(
                &client,
                &entry.url,
                &entry.filename,
                entry.sha256.as_deref(),
                entry.size,
                &mods_dir,
            )
            .await
            {
                Ok(filename) => {
                    log_info!(
                        "import_profile: [{}/{}] verified {}@{}",
                        current,
                        total,
                        entry.mod_id_str,
                        entry.mod_version
                    );
                    downloaded.push(filename);
                }
                Err(e) => {
                    log_error!(
                        "import_profile: [{}/{}] failed {}@{}: {}",
                        current,
                        total,
                        entry.mod_id_str,
                        entry.mod_version,
                        e.message
                    );
                    errors.push(format!(
                        "{}@{}: {}",
                        entry.mod_id_str, entry.mod_version, e.message
                    ));
                }
            }
        }
    } else {
        // Legacy path: parse "modid@version" and resolve each against moddb.
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
        log_info!("import_profile: {} mods to download", total);

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

            match mods::download_mod_file(&client, modid, version_str, &mods_dir).await {
                Ok(filename) => {
                    log_info!(
                        "import_profile: [{}/{}] downloaded {}@{}",
                        current,
                        total,
                        modid,
                        version_str
                    );
                    downloaded.push(filename);
                }
                Err(e) => {
                    log_error!(
                        "import_profile: [{}/{}] failed {}@{}: {}",
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
    }

    let size_bytes = dir_size(&inst_dir);

    let result = ProfileResult {
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
        external: false,
        backup_on_play: false,
        backup_limit: default_backup_limit(),
        ignore_game_defaults: false,
    };

    // A lock carried by the export lands in the profile and is enforced right
    // away: the mods just installed are verified against it, and anything the
    // pack pinned differently is repaired through ModDB. Failures are logged —
    // the profile is still usable and the lock sheet shows what is left.
    if let Some(lock) = lock {
        if let Err(error) = packs::write_lock(&inst_dir, &lock) {
            log_error!(
                "import_profile: failed to write lockfile: {}",
                error.message
            );
        } else {
            let client = app.state::<Arc<reqwest::Client>>().inner().clone();
            if let Err(error) =
                packs::sync_locked_profile(&app, &client, &inst_dir, &lock, None).await
            {
                log_error!("import_profile: lock sync failed: {}", error.message);
            }
        }
    }

    let _ = app.emit(
        &emitevent,
        json!({
            "phase": "done",
            "profile": {
                "id": result.id,
                "name": result.name,
                "version": result.version,
                "path": result.path,
                "sizeDisplay": result.size_display,
            },
            "downloaded": downloaded.len(),
            "failed": errors.len(),
            "errors": errors,
            "skipped": skipped,
        }),
    );

    log_info!(
        "import_profile: done — {} downloaded, {} failed",
        downloaded.len(),
        errors.len()
    );

    Ok(result)
}

#[command]
pub async fn initialize_game(app: AppHandle, path: String) -> Result<String, UiError> {
    log_info!("initialize_game: {:?}", path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let pb = mods_dir(PathBuf::from(&path));
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
        })?;
    }
    Ok("initialized".into())
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayGameParams {
    pub profile_id: u64,
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
    let (pb, profile) = find_profile_by_id(&app, options.profile_id)?;
    log_info!("[play_game] profile dir: {:?}", pb);
    log_info!(
        "[play_game] profile info: name={}, version={}, startParams={}",
        profile.name,
        profile.version,
        profile.start_params
    );

    mark_profile_running(options.profile_id, true);

    // Safety net: archive the profile before the game can touch it. Failures
    // are surfaced through the backup events and never block the launch.
    if profile.backup_on_play {
        let app_for_backup = app.clone();
        let profile_id = options.profile_id;
        match tauri::async_runtime::spawn_blocking(move || {
            backups::run_backup(&app_for_backup, profile_id)
        })
        .await
        {
            Ok(Ok(_)) => {}
            Ok(Err(error)) => {
                log_error!("[play_game] pre-launch backup failed: {}", error.message)
            }
            Err(error) => log_error!("[play_game] pre-launch backup task failed: {error}"),
        }
    }

    let launched = async {
        let ctx = resolve_launch_context(&app, &pb, &profile, &options).await?;
        prepare_clientsettings(&app, &pb, &profile, &options).await?;
        let _ = app.emit(
            &format!("launch-{}", options.profile_id),
            json!({ "status": "pending", "profileId": options.profile_id }),
        );
        let (child, expect_version_line) = spawn_game(&pb, &ctx, &profile, &options).await?;
        watch_process(&app, options.profile_id, pb, child, expect_version_line).await;
        Ok::<(), UiError>(())
    }
    .await;
    if let Err(error) = launched {
        mark_profile_running(options.profile_id, false);
        return Err(error);
    }

    log_info!(
        "play_game: process spawned for profile {}",
        options.profile_id
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
    profile: &ProfileInfo,
    options: &PlayGameParams,
) -> Result<LaunchContext, UiError> {
    let app_data = app.path().app_data_dir().map_err(|e| {
        log_error!("profiles: app_data_failed: {e}");
        UiError {
            name: "app_data_failed".into(),
            message: format!("Failed to get app data dir: {e}"),
        }
    })?;

    let dotnet_root = dotnet::ensure_dotnet(
        app,
        &app_data,
        super::optimum::base_game_version(&profile.version),
        options.profile_id,
        options.use_system_dotnet,
    )
    .await?;
    log_info!("[play_game] DOTNET_ROOT={:?}", dotnet_root);

    let version_path = super::versions::resolve_version_dir(app, &profile.version)?;
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
                        log_error!("profiles: walkdir error: {e}");
                        UiError::new("io_error", format!("walkdir error: {e}"))
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
                    log_error!("profiles: walkdir error: {e}");
                    UiError::new("io_error", format!("walkdir error: {e}"))
                })?;
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy();
                    if fname.eq_ignore_ascii_case(exe_name) {
                        return Ok(entry.path().to_path_buf());
                    }
                }
            }

            Err(UiError::from(
                "Could not find Vintage Story executable in profile path",
            ))
        }
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("spawn blocking error: {e}")))?
}

/// Write or update clientsettings.json for the launch.
async fn prepare_clientsettings(
    app: &AppHandle,
    pb: &Path,
    profile: &ProfileInfo,
    _options: &PlayGameParams,
) -> Result<(), UiError> {
    let account = load_selected_account(app);
    // The shared game defaults are read here, on the main thread, because the
    // write below happens on a blocking task without an AppHandle. The source
    // profile's file is read live, so changes made there carry over; the source
    // profile itself is never overwritten with its own settings.
    let (apply_game_defaults, source_profile_id, include_session) =
        game_defaults::launch_defaults(app);
    let defaults = if apply_game_defaults {
        match source_profile_id {
            Some(id) if profile_id_for_dir(pb) != id => {
                game_defaults::live_snapshot(app, id, include_session)
            }
            Some(_) => {
                log_info!("[play_game] game defaults skipped — this is the source profile");
                None
            }
            None => None,
        }
    } else {
        None
    };
    tokio::task::spawn_blocking({
        let pb = pb.to_path_buf();
        let profile = profile.clone();
        move || write_clientsettings(&pb, &profile, &account, &defaults, apply_game_defaults)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("spawn blocking error: {e}")))?
}

fn write_clientsettings(
    pb: &Path,
    profile: &ProfileInfo,
    account: &Option<SavedAccount>,
    defaults: &Option<Value>,
    apply_game_defaults: bool,
) -> Result<(), UiError> {
    let settings_path = clientsettings_path(pb);
    log_info!("[play_game] clientsettings.json path: {:?}", settings_path);

    let mut settings_json: Value = if settings_path.exists() {
        log_info!("[play_game] reading existing clientsettings.json");
        let mut existing = String::new();
        File::open(&settings_path)
            .and_then(|mut f| f.read_to_string(&mut existing))
            .map_err(|e| {
                log_error!("profiles: read_failed: {e}");
                UiError {
                    name: "read_failed".into(),
                    message: format!("Failed to read clientsettings.json: {e}"),
                }
            })?;
        from_str(&existing).unwrap_or(json!({}))
    } else {
        log_info!("[play_game] clientsettings.json does not exist — creating new");
        create_dir_all(settings_path.parent().unwrap()).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
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
                *mod_paths = vec![json!(mods_path), json!(paths::MODS_DIR)];
                log_info!("[play_game] updated existing modPaths");
            } else {
                string_list_settings.insert("modPaths".into(), json!([mods_path, paths::MODS_DIR]));
                log_info!("[play_game] inserted modPaths into existing stringListSettings");
            }
        } else {
            obj.insert(
                "stringListSettings".into(),
                json!({ "modPaths": [mods_path, paths::MODS_DIR] }),
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

    // Finally merge the shared game defaults (key bindings + game/video
    // settings), read live from the source profile. The account merge above
    // injects the selected launcher account's session, so a source session
    // only applies when no account is selected.
    if apply_game_defaults && !profile.ignore_game_defaults {
        if let Some(defaults) = defaults.as_ref() {
            let allow_session = account.is_none();
            let written =
                game_defaults::apply_defaults(&mut settings_json, defaults, allow_session);
            log_info!(
                "[play_game] applied {} shared game default settings",
                written
            );
            if game_defaults::carries_session(defaults) && !allow_session {
                log_info!(
                    "[play_game] copied account session skipped — a launcher account is selected"
                );
            }
        }
    } else if apply_game_defaults {
        log_info!("[play_game] game defaults skipped — profile opted out");
    }

    write(&settings_path, to_string_pretty(&settings_json).unwrap()).map_err(|e| {
        log_error!("profiles: write_failed: {e}");
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
    profile: &ProfileInfo,
    options: &PlayGameParams,
) -> Result<(tokio::process::Child, bool), UiError> {
    let start_params = profile.start_params.as_str();

    #[cfg(target_os = "macos")]
    let (child, expect_version_line) = if let Some(ref app_bundle) = ctx.app_bundle {
        (
            macos::spawn_via_open(
                app_bundle,
                pb,
                &ctx.dotnet_root,
                options,
                start_params,
                &profile.env_vars,
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
                &profile.env_vars,
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
            &profile.env_vars,
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
    cmd.args(parse_start_params(start_params)?);

    cmd.spawn().map_err(|e| {
        log_error!("profiles: launch_failed: {e}");
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
    profile_id: u64,
    profile_dir: PathBuf,
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
                                        &format!("launch-{profile_id}"),
                                        json!({
                                            "status": "success",
                                            "profileId": profile_id,
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
                                        &format!("launch-{profile_id}"),
                                        json!({
                                            "status": "success",
                                            "profileId": profile_id,
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
                            &format!("launch-{profile_id}"),
                            json!({
                                "status": "error",
                                "profileId": profile_id,
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
                &format!("launch-{profile_id}"),
                json!({
                    "status": "success",
                    "profileId": profile_id,
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
                update_profile_playtime(&profile_dir, profile_id, elapsed, &app);
            }
            Err(e) => {
                log_error!("[play_game] failed to wait for process: {e}");
            }
        }
        mark_profile_running(profile_id, false);
    });
}

fn update_profile_playtime(profile_dir: &Path, profile_id: u64, elapsed: u64, app: &AppHandle) {
    match read_profile_json(profile_dir) {
        Ok(mut info) => {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            info.last_played = Some(now_ms);
            info.total_time_played += elapsed;
            let total = info.total_time_played;

            match write_profile_json(profile_dir, &info) {
                Ok(()) => {
                    let _ = app.emit(
                        &format!("game-quit-{profile_id}"),
                        json!({
                            "profileId": profile_id,
                            "elapsedSeconds": elapsed,
                            "lastPlayed": now_ms,
                            "totalTimePlayed": total,
                        }),
                    );
                }
                Err(e) => {
                    log_error!("[play_game] failed to write profile.json: {}", e.message);
                }
            }
        }
        Err(e) => {
            log_error!("[play_game] failed to read profile.json: {}", e.message);
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

        // No existing .app bundle. Restructure old profile if needed.
        let app_bundle = version_path.join("Vintage Story.app");
        if !app_bundle.exists() {
            log_info!(
                "[play_game] macOS: restructuring old profile into {:?}",
                app_bundle
            );
            restructure_into_app_bundle(version_path, &app_bundle).map_err(|e| {
                log_error!("[play_game] macOS: failed to restructure .app bundle: {e}");
                UiError::new(
                    "io_error",
                    format!("Failed to restructure .app bundle: {e}"),
                )
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
        open_args.extend(parse_start_params(start_params)?);

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
                log_error!("profiles: launch_failed: {e}");
                UiError {
                    name: "launch_failed".into(),
                    message: format!("Failed to launch via open: {e}"),
                }
            })
    }
}

#[command]
pub fn reveal_in_file_explorer(app: AppHandle, path: String) -> Result<String, UiError> {
    use tauri_plugin_opener::OpenerExt;

    let path = PathBuf::from(&path);
    if !path.exists() {
        create_dir_all(&path).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError::new(
                "create_dir_failed",
                format!("Failed to create directory: {e}"),
            )
        })?;
    }

    // The plugin canonicalizes the path, so it must exist by now.
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| UiError::new("reveal_failed", format!("Failed to open file manager: {e}")))?;

    Ok(path.to_string_lossy().to_string())
}

/// Joins a webview-supplied `subdir` onto `base`, refusing anything that could
/// leave it: empty values, `..` components and absolute paths.
fn join_subdir(base: &Path, subdir: &str, what: &str) -> Result<PathBuf, UiError> {
    let stays_inside = !subdir.is_empty()
        && Path::new(subdir)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && normalize_path(&base.join(subdir)).starts_with(normalize_path(base));

    if !stays_inside {
        return Err(UiError::new(
            "invalid_path",
            format!("{what} must stay inside {}: {subdir}", base.display()),
        ));
    }
    Ok(base.join(subdir))
}

#[command]
pub async fn move_profiles_folder(
    app: AppHandle,
    source: String,
    destination: String,
    subdir: String,
) -> Result<String, UiError> {
    let src = join_subdir(Path::new(&source), &subdir, "Source directory")?;
    let dst = join_subdir(Path::new(&destination), &subdir, "Destination")?;
    require_managed_path(&app, &src, "Source directory")?;
    require_safe_destination(Path::new(&destination), "Destination")?;
    log_info!("move_profiles_folder: {:?} -> {:?}", src, dst);
    let outcome = move_folder(src, dst)?;
    log_info!("move_profiles_folder: {outcome}");
    Ok(outcome)
}

#[command]
pub async fn remove_all_profiles(
    app: AppHandle,
    source: String,
    subdir: String,
) -> Result<String, UiError> {
    let source_path = join_subdir(Path::new(&source), &subdir, "Source directory")?;
    require_managed_path(&app, &source_path, "Source directory")?;
    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }
    log_info!("remove_all_profiles: {:?}", source_path);
    remove_dir_all(&source_path).map_err(|e| {
        log_error!("profiles: remove_failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove profiles directory: {e}"),
        }
    })?;
    Ok("removed".into())
}

// ── Profile log files ──

#[derive(Debug, Clone, Serialize)]
pub struct ProfileLog {
    pub name: String,
    pub size_bytes: u64,
    pub path: String,
}

#[command]
pub fn get_profile_logs(app: AppHandle, profile_path: String) -> Result<Vec<ProfileLog>, UiError> {
    require_managed_path(&app, Path::new(&profile_path), "Profile path")?;
    let logs_dir = PathBuf::from(&profile_path).join(paths::LOGS_DIR);
    let mut logs = Vec::new();
    if !logs_dir.is_dir() {
        return Ok(logs);
    }
    for entry in read_dir(&logs_dir).map_err(|e| {
        log_error!("get_profile_logs: read_dir failed: {e}");
        UiError {
            name: "io_error".into(),
            message: format!("Failed to read Logs directory: {e}"),
        }
    })? {
        let entry = entry.map_err(|e| {
            log_error!("get_profile_logs: entry error: {e}");
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
            logs.push(ProfileLog {
                name,
                size_bytes: size,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    Ok(logs)
}

#[command]
pub fn read_profile_log(app: AppHandle, log_path: String) -> Result<String, UiError> {
    require_managed_path(&app, Path::new(&log_path), "Log path")?;
    read_to_string(&log_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read log file: {e}"),
    })
}

/// Zip up the ModConfig folder from an profile and return the bytes.
#[command]
pub fn zip_modconfig(app: AppHandle, profile_path: String) -> Result<Vec<u8>, UiError> {
    require_managed_path(&app, Path::new(&profile_path), "Profile path")?;
    let modconfig_dir = PathBuf::from(&profile_path).join(paths::MODCONFIG_DIR);
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The ID returned by `import_profile` must match the directory that
    /// was created, otherwise `find_profile_by_id` cannot find the
    /// profile again when the display name differs from the folder name.
    #[test]
    fn profile_id_matches_directory_name() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("my_world");
        std::fs::create_dir(&dir).unwrap();

        let id = profile_id_for_dir(&dir);
        assert_eq!(find_dir_by_id(tmp.path(), id).unwrap(), Some(dir));
        assert_ne!(id, generate_id("My World"));
    }

    /// Client profiles take client/both entries only, and never a release the
    /// manifest resolved as incompatible with the pack's game version.
    #[test]
    fn manifest_skip_reason_flags_server_side_and_incompatible() {
        let entry = |side: Option<&str>, compatible: Option<bool>| ManifestModParam {
            mod_id_str: "testmod".into(),
            mod_version: "1.0.0".into(),
            filename: "testmod.zip".into(),
            url: "https://mods.vintagestory.at/testmod.zip".into(),
            sha256: None,
            size: None,
            side: side.map(str::to_string),
            compatible,
        };

        assert_eq!(
            manifest_skip_reason(&entry(Some("server"), None)),
            Some("server-side mod")
        );
        assert_eq!(
            manifest_skip_reason(&entry(Some("both"), Some(false))),
            Some("not compatible with the selected game version")
        );
        assert_eq!(
            manifest_skip_reason(&entry(Some("client"), Some(true))),
            None
        );
        assert_eq!(manifest_skip_reason(&entry(None, None)), None);
    }
}
