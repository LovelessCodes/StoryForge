//! Import of VS Launcher (XurxoMF) installations as Story Forge profiles.
//!
//! VS Launcher keeps everything in `<appData>/VSLauncher/config.json`
//! (it overrides Electron's userData to that folder). Installations are
//! data-path folders — the same shape as a profile — with a display name, a
//! game version, launch parameters, environment variables and playtime:
//!
//! ```json
//! { "installations": [{ "name": "…", "path": "…", "version": "1.21.3",
//!   "startParams": "", "envVars": "KEY=value,OTHER=value",
//!   "mesaGlThread": false, "lastTimePlayed": 1700000000000,
//!   "totalTimePlayed": 3600000 }] }
//! ```
//!
//! Import moves or copies the folder into the profiles root (the user
//! chooses) and writes a `profile.json`. VS Launcher stores playtime in
//! milliseconds (ours is seconds) and uses its own icon artwork, so icons are
//! not carried over.

use std::{
    collections::HashMap,
    fs::{create_dir_all, read_to_string, write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{
    copy_profile_dir, free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip,
};
use super::paths::{MODS_DIR, PROFILE_JSON};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, normalize_path, profiles_folder, profiles_subdir,
    require_managed_path,
};
use crate::log_info;

/// Folder VS Launcher pins its Electron userData to (inside the OS app-data dir).
const VS_LAUNCHER_DIR: &str = "VSLauncher";
const MIGRATION_LOG_FILE: &str = "vs-launcher-migration.json";

#[derive(Debug, Deserialize)]
struct VsConfig {
    #[serde(default)]
    installations: Vec<VsInstallation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VsInstallation {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    start_params: String,
    #[serde(default)]
    env_vars: String,
    #[serde(default)]
    mesa_gl_thread: bool,
    #[serde(default)]
    last_time_played: i64,
    #[serde(default)]
    total_time_played: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VsLauncherInstallation {
    pub id: String,
    pub name: String,
    pub version: String,
    pub path: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// The path is the game's own default data folder: a copy duplicates it,
    /// a move breaks the stock launcher.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VsMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct VsMigrationLog {
    #[serde(default)]
    migrations: Vec<VsMigrationEntry>,
}

/// `<appData>/VSLauncher/config.json`, per platform.
fn config_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(
            home.join("Library/Application Support")
                .join(VS_LAUNCHER_DIR),
        );
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        candidates.push(appdata.join(VS_LAUNCHER_DIR));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    if let Some(config) = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from) {
        candidates.push(config.join(VS_LAUNCHER_DIR));
    } else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".config").join(VS_LAUNCHER_DIR));
    }

    candidates
        .into_iter()
        .map(|dir| dir.join("config.json"))
        .collect()
}

fn read_config() -> Result<Option<(PathBuf, VsConfig)>, UiError> {
    let Some(path) = config_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
    else {
        return Ok(None);
    };
    let content = read_to_string(&path).map_err(|e| {
        UiError::new(
            "read_failed",
            format!("Failed to read the VS Launcher config: {e}"),
        )
    })?;
    let config: VsConfig = serde_json::from_str(&content).map_err(|e| {
        UiError::new(
            "parse_failed",
            format!("Failed to parse the VS Launcher config: {e}"),
        )
    })?;
    Ok(Some((path, config)))
}

fn migration_log_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(MIGRATION_LOG_FILE))
        .map_err(|e| UiError {
            name: "path_error".into(),
            message: format!("Failed to resolve app data dir: {e}"),
        })
}

fn read_migration_log(app: &AppHandle) -> VsMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &VsMigrationLog) -> Result<(), UiError> {
    let path = migration_log_path(app)?;
    let content = serde_json::to_string_pretty(log)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize log: {e}")))?;
    write(&path, content).map_err(|e| {
        UiError::new(
            "write_failed",
            format!("Failed to write migration log: {e}"),
        )
    })
}

/// VS Launcher stores `KEY=value` pairs joined by commas.
fn parse_env_vars(raw: &str) -> HashMap<String, String> {
    raw.split(',')
        .filter_map(|entry| {
            let (key, value) = entry.split_once('=')?;
            let key = key.trim();
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), value.trim().to_string()))
        })
        .collect()
}

fn count_zips(dir: &Path) -> usize {
    std::fs::read_dir(dir.join(MODS_DIR))
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

/// Lists VS Launcher installations that can be imported.
#[command]
pub async fn detect_vs_launcher_installations(
    app: AppHandle,
) -> Result<Vec<VsLauncherInstallation>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("VS Launcher scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<VsLauncherInstallation>, UiError> {
    let Some((config_path, config)) = read_config()? else {
        return Ok(Vec::new());
    };
    log_info!("vs_launcher: reading {}", config_path.display());

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let game_data_candidates = super::game_data::default_data_candidates();
    let mut results = Vec::new();

    for installation in config.installations {
        if installation.name.trim().is_empty() || installation.path.trim().is_empty() {
            continue;
        }
        let path = PathBuf::from(&installation.path);
        if !path.is_dir() {
            continue;
        }
        // Already part of Story Forge (root profile or adopted folder).
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }

        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });
        let is_default_game_data = game_data_candidates
            .iter()
            .any(|candidate| normalize_path(candidate) == normalize_path(&path));

        let size_bytes = dir_size_cached(&path);
        results.push(VsLauncherInstallation {
            id: installation.id,
            name: installation.name,
            version: installation.version,
            path: installation.path,
            mod_count: count_zips(&path),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: path.join("Saves").is_dir(),
            last_time_played: (installation.last_time_played > 0)
                .then_some(installation.last_time_played as u64),
            is_default_game_data,
            already_imported,
        });
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("vs_launcher: found {} installation(s)", results.len());
    Ok(results)
}

/// Imports VS Launcher installations into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep VS Launcher working).
/// Only paths listed in the VS Launcher config are accepted, and folder name
/// collisions import under a suffixed name.
#[command]
pub async fn import_vs_launcher_installations(
    app: AppHandle,
    paths: Vec<String>,
    mode: String,
) -> Result<LegacyMigrationReport, UiError> {
    if mode != "move" && mode != "copy" {
        return Err(UiError::new(
            "invalid_mode",
            "Import mode must be \"move\" or \"copy\"",
        ));
    }
    let handle = app.clone();
    tokio::task::spawn_blocking(move || import_blocking(&handle, paths, &mode))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}

fn import_blocking(
    app: &AppHandle,
    requested: Vec<String>,
    mode: &str,
) -> Result<LegacyMigrationReport, UiError> {
    let Some((_config_path, config)) = read_config()? else {
        return Err(UiError::not_found("VS Launcher config not found"));
    };
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    create_dir_all(&profiles_root).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create profiles folder: {e}"),
        )
    })?;

    let mut log = read_migration_log(app);
    let mut report = LegacyMigrationReport {
        migrated: 0,
        skipped: Vec::new(),
    };

    for requested_path in requested {
        let requested_normalized = normalize_path(Path::new(&requested_path));
        let Some(installation) = config
            .installations
            .iter()
            .find(|item| normalize_path(Path::new(&item.path)) == requested_normalized)
        else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in the VS Launcher config".into(),
            });
            continue;
        };

        let source = PathBuf::from(&installation.path);
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: installation.name.clone(),
                reason: "folder no longer exists".into(),
            });
            continue;
        }
        let folder = dir_name(&source);
        if folder.is_empty() || folder.starts_with('.') {
            report.skipped.push(LegacyMigrationSkip {
                name: installation.name.clone(),
                reason: "invalid folder name".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name: installation.name.clone(),
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name: installation.name.clone(),
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let target = if mode == "move" {
            let target = free_profile_dir(&profiles_root, &folder);
            require_managed_path(app, &target, "profile")?;
            if super::utils::move_folder(source.clone(), target.clone()).is_err()
                || !target.is_dir()
            {
                report.skipped.push(LegacyMigrationSkip {
                    name: installation.name.clone(),
                    reason: "failed to move the folder".into(),
                });
                continue;
            }
            target
        } else {
            match copy_profile_dir(&profiles_root, &source, &folder) {
                Ok(target) => target,
                Err(e) => {
                    report.skipped.push(LegacyMigrationSkip {
                        name: installation.name.clone(),
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: installation.name.clone(),
            ..Default::default()
        });
        if !installation.name.trim().is_empty() {
            info.name = installation.name.clone();
        }
        info.version = installation.version.clone();
        info.start_params = installation.start_params.clone();
        info.last_played =
            (installation.last_time_played > 0).then_some(installation.last_time_played as u64);
        info.total_time_played = (installation.total_time_played.max(0) / 1000) as u64;
        info.env_vars = parse_env_vars(&installation.env_vars);
        if installation.mesa_gl_thread {
            info.env_vars
                .insert("MESA_GLTHREAD".to_string(), "true".to_string());
        }

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: installation.name.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("vs_launcher: imported {} ({})", info.name, mode);
        log.migrations.push(VsMigrationEntry {
            source_path: installation.path.clone(),
            target_path: target.to_string_lossy().to_string(),
            name: info.name.clone(),
        });
        report.migrated += 1;
    }

    if report.migrated > 0 {
        write_migration_log(app, &log)?;
    }

    Ok(report)
}
