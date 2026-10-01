//! Import of MVL (scgm0/MVL) modpack folders as Story Forge profiles.
//!
//! MVL keeps its config in `<Godot user dir>/MVL/data.json` with a list of
//! absolute modpack folder paths (`modpack`, `modpackFolder`). A modpack
//! folder *is* the game data path — VSRun launches the game with the modpack
//! as `VintageStoryDataPath` — so importing is the same shape as the other
//! launcher importers: move or copy the folder into the profiles root and
//! write a `profile.json`.
//!
//! `<modpack>/modpack.json` carries the name and game version:
//!
//! ```json
//! { "modpackName": "…", "gameVersion": "1.21.3", "command": "…",
//!   "mainAssembly": "Vintagestory.dll" }                 // v1
//! { "name": "…", "version": "1.21.3", "gameAssembly": "" } // v0
//! ```
//!
//! MVL's `command`/`mainAssembly` describe how it wraps the game with VSRun,
//! which has no Story Forge equivalent, and its `modpackIcon.*` artwork is
//! its own — neither is carried over. MVL does not track playtime.

use std::{
    fs::{create_dir_all, read_to_string, write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
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

/// Folder MVL uses inside Godot's user dir (`use_custom_user_dir`).
const MVL_DIR: &str = "MVL";
const MIGRATION_LOG_FILE: &str = "mvl-migration.json";

#[derive(Debug, Clone, Serialize)]
pub struct MvlModpack {
    pub id: String,
    pub name: String,
    pub version: String,
    pub path: String,
    /// Constant "MVL"; kept so every importer reports the same shape.
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// Always false for MVL (its folders are never the stock data folder) —
    /// kept for shape parity with the other launcher importers.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MvlMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MvlMigrationLog {
    #[serde(default)]
    migrations: Vec<MvlMigrationEntry>,
}

/// `<Godot user dir>/MVL/data.json`, per platform.
///
/// Godot's user dir is `%APPDATA%` on Windows, `$XDG_DATA_HOME` (usually
/// `~/.local/share`) on Linux and `~/Library/Application Support` on macOS.
fn config_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join("Library/Application Support").join(MVL_DIR));
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        candidates.push(appdata.join(MVL_DIR));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    if let Some(data) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from) {
        candidates.push(data.join(MVL_DIR));
    } else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push(home.join(".local/share").join(MVL_DIR));
    }

    candidates
        .into_iter()
        .map(|dir| dir.join("data.json"))
        .collect()
}

fn read_config() -> Result<Option<(PathBuf, Value)>, UiError> {
    let Some(path) = config_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
    else {
        return Ok(None);
    };
    let content = read_to_string(&path)
        .map_err(|e| UiError::new("read_failed", format!("Failed to read the MVL config: {e}")))?;
    let config: Value = serde_json::from_str(&content).map_err(|e| {
        UiError::new(
            "parse_failed",
            format!("Failed to parse the MVL config: {e}"),
        )
    })?;
    Ok(Some((path, config)))
}

/// Absolute modpack folder paths listed in `data.json`.
///
/// Relative entries (old configs) resolve against `modpackFolder`, which
/// itself defaults to `<config dir>/Modpack`.
fn config_modpack_paths(config: &Value, config_dir: &Path) -> Vec<PathBuf> {
    let modpack_folder = config
        .get("modpackFolder")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| config_dir.join("Modpack"));

    config
        .get("modpack")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    let path = PathBuf::from(value);
                    if path.is_absolute() {
                        path
                    } else {
                        modpack_folder.join(path)
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Game versions installed by MVL (its `release` path list). The version name
/// comes from the folder name, which is how MVL names downloaded releases.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Ok(Some((config_path, config))) = read_config() else {
        return Vec::new();
    };
    let config_dir = config_path.parent().unwrap_or(Path::new("."));
    release_paths(&config, config_dir)
        .into_iter()
        .filter_map(|path| {
            if !super::versions::looks_like_game_dir(&path) {
                return None;
            }
            let name = dir_name(&path);
            if !name.chars().any(|c| c.is_ascii_digit()) {
                return None;
            }
            Some(super::versions::DetectedVersion {
                name,
                path: path.to_string_lossy().to_string(),
                source: "MVL".into(),
            })
        })
        .collect()
}

/// Absolute release (game version) folder paths listed in `data.json`.
fn release_paths(config: &Value, config_dir: &Path) -> Vec<PathBuf> {
    let release_folder = config
        .get("releaseFolder")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| config_dir.join("Release"));

    config
        .get("release")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    let path = PathBuf::from(value);
                    if path.is_absolute() {
                        path
                    } else {
                        release_folder.join(path)
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Reads `<modpack>/modpack.json` when present.
fn read_manifest(modpack_dir: &Path) -> Option<Value> {
    let content = read_to_string(modpack_dir.join("modpack.json")).ok()?;
    serde_json::from_str(&content).ok()
}

fn manifest_name(manifest: Option<&Value>, folder: &str) -> String {
    manifest
        .and_then(|value| value.get("modpackName").or_else(|| value.get("name")))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(folder)
        .to_string()
}

/// v1 `gameVersion`; v0 used `version` for the game version.
fn manifest_game_version(manifest: Option<&Value>) -> String {
    manifest
        .and_then(|value| value.get("gameVersion").or_else(|| value.get("version")))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
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

fn read_migration_log(app: &AppHandle) -> MvlMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &MvlMigrationLog) -> Result<(), UiError> {
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

/// Lists MVL modpacks that can be imported.
#[command]
pub async fn detect_mvl_modpacks(app: AppHandle) -> Result<Vec<MvlModpack>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("MVL scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<MvlModpack>, UiError> {
    let Some((config_path, config)) = read_config()? else {
        return Ok(Vec::new());
    };
    log_info!("mvl: reading {}", config_path.display());

    let config_dir = config_path.parent().unwrap_or(Path::new("."));
    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let mut results = Vec::new();

    for path in config_modpack_paths(&config, config_dir) {
        if !path.is_dir() {
            continue;
        }
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }

        let folder = dir_name(&path);
        if folder.is_empty() || folder.starts_with('.') {
            continue;
        }
        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });

        let manifest = read_manifest(&path);
        let size_bytes = dir_size_cached(&path);
        results.push(MvlModpack {
            id: folder.clone(),
            name: manifest_name(manifest.as_ref(), &folder),
            version: manifest_game_version(manifest.as_ref()),
            path: path.to_string_lossy().to_string(),
            source: "MVL".into(),
            mod_count: count_zips(&path),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: path.join("Saves").is_dir(),
            last_time_played: None,
            is_default_game_data: false,
            already_imported,
        });
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("mvl: found {} modpack(s)", results.len());
    Ok(results)
}

/// Imports MVL modpacks into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep MVL working). Only paths
/// listed in the MVL config are accepted, and folder name collisions import
/// under a suffixed name.
#[command]
pub async fn import_mvl_modpacks(
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
    let Some((config_path, config)) = read_config()? else {
        return Err(UiError::not_found("MVL config not found"));
    };
    let config_dir = config_path.parent().unwrap_or(Path::new("."));
    let listed: Vec<PathBuf> = config_modpack_paths(&config, config_dir);

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
        let Some(source) = listed
            .iter()
            .find(|path| normalize_path(path) == requested_normalized)
            .cloned()
        else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in the MVL config".into(),
            });
            continue;
        };

        let folder = dir_name(&source);
        let manifest = read_manifest(&source);
        let name = manifest_name(manifest.as_ref(), &folder);

        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "folder no longer exists".into(),
            });
            continue;
        }
        if folder.is_empty() || folder.starts_with('.') {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "invalid folder name".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name,
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
                    name,
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
                        name,
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: name.clone(),
            ..Default::default()
        });
        info.name = name.clone();
        info.version = manifest_game_version(manifest.as_ref());

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("mvl: imported {} ({})", info.name, mode);
        log.migrations.push(MvlMigrationEntry {
            source_path: source.to_string_lossy().to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(json: &str) -> Value {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn reads_v1_manifest() {
        let value = manifest(
            r#"{"modpackName":"My Pack","gameVersion":"1.21.3","command":"dotnet","mainAssembly":"Vintagestory.dll"}"#,
        );
        assert_eq!(manifest_name(Some(&value), "folder"), "My Pack");
        assert_eq!(manifest_game_version(Some(&value)), "1.21.3");
    }

    #[test]
    fn reads_v0_manifest() {
        let value = manifest(r#"{"name":"Old Pack","version":"1.20.4"}"#);
        assert_eq!(manifest_name(Some(&value), "folder"), "Old Pack");
        assert_eq!(manifest_game_version(Some(&value)), "1.20.4");
    }

    #[test]
    fn falls_back_to_folder_name_and_empty_version() {
        assert_eq!(manifest_name(None, "MyFolder"), "MyFolder");
        assert_eq!(manifest_game_version(None), "");
        let empty = manifest(r#"{"modpackName":"  ","modpackVersion":"1.0.0"}"#);
        // `modpackVersion` is the modpack's own version, not the game version.
        assert_eq!(manifest_name(Some(&empty), "MyFolder"), "MyFolder");
        assert_eq!(manifest_game_version(Some(&empty)), "");
    }

    #[test]
    fn resolves_modpack_paths_against_the_config_folder() {
        let config =
            manifest(r#"{"modpackFolder":"/data/Modpack","modpack":["/abs/pack","rel/pack",""]}"#);
        let paths = config_modpack_paths(&config, Path::new("/data/MVL"));
        assert_eq!(
            paths,
            vec![
                PathBuf::from("/abs/pack"),
                PathBuf::from("/data/Modpack/rel/pack"),
            ]
        );
    }

    #[test]
    fn resolves_release_paths() {
        let config =
            manifest(r#"{"releaseFolder":"/data/Release","release":["/abs/1.20.0","1.21.3",""]}"#);
        let paths = release_paths(&config, Path::new("/data/MVL"));
        assert_eq!(
            paths,
            vec![
                PathBuf::from("/abs/1.20.0"),
                PathBuf::from("/data/Release/1.21.3"),
            ]
        );
    }

    #[test]
    fn defaults_the_modpack_folder_next_to_the_config() {
        let config = manifest(r#"{"modpack":["pack"]}"#);
        let paths = config_modpack_paths(&config, Path::new("/data/MVL"));
        assert_eq!(paths, vec![PathBuf::from("/data/MVL/Modpack/pack")]);
    }
}
