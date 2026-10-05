//! Adoption of an existing Vintage Story data folder (the game's default
//! `VintagestoryData` location) as a Story Forge profile.
//!
//! Nothing is copied or moved: the profile links to the folder, the
//! `external-profiles.json` registry marks it as app-managed (so mod, world
//! and config operations work on it), and a `profile.json` manifest is written
//! so the folder behaves like any other profile.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::profile_ops::validate_profile_name;
use super::profiles::{
    external_profile_paths, is_external_profile_dir, read_profile_json, set_external_profile_paths,
    write_profile_json, ProfileInfo, ProfileResult,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, generate_id, normalize_path, profiles_folder,
    profiles_subdir,
};

#[derive(Debug, Clone, Serialize)]
pub struct DetectedGameData {
    pub path: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    /// Already registered as an external profile.
    pub registered: bool,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

/// Default `VintagestoryData` locations, most likely first.
pub(crate) fn default_data_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = home_dir() {
            // 1.21+ moved here from ~/.config.
            candidates.push(home.join("Library/Application Support/VintagestoryData"));
            candidates.push(home.join(".config/VintagestoryData"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            candidates.push(appdata.join("VintagestoryData"));
        } else if let Some(home) = home_dir() {
            candidates.push(home.join("AppData/Roaming/VintagestoryData"));
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(home) = home_dir() {
            if let Some(config) = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from) {
                candidates.push(config.join("VintagestoryData"));
            } else {
                candidates.push(home.join(".config/VintagestoryData"));
            }
            candidates
                .push(home.join(".var/app/at.vintagestory.VintageStory/config/VintagestoryData"));
        }
    }

    candidates
}

fn looks_like_game_data(dir: &Path) -> bool {
    dir.is_dir()
        && (dir.join("Mods").is_dir()
            || dir.join("Saves").is_dir()
            || dir.join("ModConfig").is_dir()
            || dir.join("clientsettings.json").is_file())
}

fn count_zips(dir: &Path) -> usize {
    std::fs::read_dir(dir.join("Mods"))
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| {
                    entry.path().is_file()
                        && entry
                            .path()
                            .extension()
                            .map(|ext| ext.eq_ignore_ascii_case("zip"))
                            .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

/// Finds existing Vintage Story data folders in the game's default locations.
#[command]
pub async fn detect_default_game_data(app: AppHandle) -> Result<Vec<DetectedGameData>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        for path in default_data_candidates() {
            if !looks_like_game_data(&path) {
                continue;
            }
            let size_bytes = dir_size_cached(&path);
            results.push(DetectedGameData {
                registered: is_external_profile_dir(&handle, &path),
                has_saves: path.join("Saves").is_dir(),
                mod_count: count_zips(&path),
                path: path.to_string_lossy().to_string(),
                size_bytes,
                size_display: format_size(size_bytes),
            });
        }
        Ok(results)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Game data scan failed: {e}")))?
}

/// Links a game data folder as a profile. The folder is never modified except
/// for the `profile.json` manifest Story Forge writes into it.
#[command]
pub async fn adopt_game_data(
    app: AppHandle,
    path: String,
    name: String,
    version: String,
) -> Result<ProfileResult, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || adopt_blocking(&handle, &path, &name, &version))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Adopt failed: {e}")))?
}

fn adopt_blocking(
    app: &AppHandle,
    path: &str,
    name: &str,
    version: &str,
) -> Result<ProfileResult, UiError> {
    let dir = PathBuf::from(path);
    if !looks_like_game_data(&dir) {
        return Err(UiError::new(
            "not_found",
            "That folder does not look like a Vintage Story data folder",
        ));
    }
    let name = validate_profile_name(name)?;

    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    if normalize_path(&dir).starts_with(normalize_path(&profiles_root)) {
        return Err(UiError::new(
            "invalid_path",
            "That folder is already inside the profiles folder",
        ));
    }

    // Register (dedupe by normalized path).
    let mut paths = external_profile_paths(app);
    if !paths
        .iter()
        .any(|existing| normalize_path(existing) == normalize_path(&dir))
    {
        paths.push(dir.clone());
        set_external_profile_paths(app, &paths)?;
    }

    // Write the manifest, preserving metadata from a previous adoption.
    let mut info = read_profile_json(&dir).unwrap_or_else(|_| ProfileInfo {
        name: dir_name(&dir),
        ..Default::default()
    });
    info.name = name;
    info.version = version.to_string();
    write_profile_json(&dir, &info)?;

    let size_bytes = dir_size_cached(&dir);
    Ok(ProfileResult {
        id: generate_id(&dir_name(&dir)),
        name: info.name,
        version: info.version,
        start_params: info.start_params,
        path: dir.to_string_lossy().to_string(),
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
    })
}

/// Stops managing a game data folder. The folder itself is left untouched.
#[command]
pub async fn unregister_external_profile(app: AppHandle, path: String) -> Result<(), UiError> {
    let target = normalize_path(Path::new(&path));
    let remaining: Vec<PathBuf> = external_profile_paths(&app)
        .into_iter()
        .filter(|registered| normalize_path(registered) != target)
        .collect();
    set_external_profile_paths(&app, &remaining)
}
