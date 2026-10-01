//! Import of Rustory (XurxoMF) instances as Story Forge profiles.
//!
//! Rustory is the successor of VS Launcher by the same author and keeps
//! installations under a `VSInstances` folder. Each instance is its own
//! directory holding `instance.json`, the game data in `Data/` (mods in
//! `Data/Mods`, worlds in `Data/Saves`) and backups in `Backups/`:
//!
//! ```json
//! { "id": "…", "name": "…", "version": "1.21.3", "startParams": "",
//!   "envVars": "KEY=value", "mesaGlThread": false, "backupsLimit": 3,
//!   "lastTimePlayed": 1700000000000, "totalTimePlayed": 3600000 }
//! ```
//!
//! The folder names come from `<appConfigDir>/config.json`
//! (`vsInstancesPath` / `vsVersionsPath`, Tauri identifier `xyz.rustory.app`)
//! and default to `<appDataDir>/VSInstances` and `<appDataDir>/VSVersions`.
//! Import copies `Data/` into a profile — copy only, because the instance
//! directory also holds Rustory's `instance.json` and `Backups/` — and leaves
//! the game builds in place so they can be linked.

use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, rename, write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip};
use super::paths::{MODS_DIR, PROFILE_JSON, SAVES_DIR};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    copy_dir_contents, dir_size_cached, format_size, normalize_path, now_nanos, profiles_folder,
    profiles_subdir, safe_file_name,
};
use crate::{log_error, log_info};

/// Tauri identifier Rustory writes its config and data under.
const APP_ID: &str = "xyz.rustory.app";
const CONFIG_FILE: &str = "config.json";
const INSTANCE_FILE: &str = "instance.json";
/// Game data inside an instance directory.
const DATA_DIR: &str = "Data";
const INSTANCES_DIR: &str = "VSInstances";
const VERSIONS_DIR: &str = "VSVersions";
const MIGRATION_LOG_FILE: &str = "rustory-migration.json";

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustoryConfig {
    #[serde(default)]
    vs_instances_path: String,
    #[serde(default)]
    vs_versions_path: String,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RustoryInstanceFile {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
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
pub struct RustoryInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    /// The instance folder (import copies its `Data/`).
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// Always false: Rustory keeps each instance's data inside its folder.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RustoryMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RustoryMigrationLog {
    #[serde(default)]
    migrations: Vec<RustoryMigrationEntry>,
}

/// `<appConfigDir>/config.json`.
fn config_candidates() -> Vec<PathBuf> {
    super::utils::platform_config_dirs()
        .into_iter()
        .map(|base| base.join(APP_ID).join(CONFIG_FILE))
        .collect()
}

/// `<appDataDir>` (the base Rustory's default instance/version folders sit in).
fn data_candidates() -> Vec<PathBuf> {
    super::utils::platform_data_dirs()
        .into_iter()
        .map(|base| base.join(APP_ID))
        .collect()
}

fn read_config() -> Option<RustoryConfig> {
    for path in config_candidates() {
        if !path.is_file() {
            continue;
        }
        let Ok(content) = read_to_string(&path) else {
            continue;
        };
        match serde_json::from_str::<RustoryConfig>(&content) {
            Ok(config) => return Some(config),
            Err(error) => {
                log_error!("rustory: failed to parse {}: {error}", path.display());
            }
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RustoryPaths {
    instances: PathBuf,
    versions: PathBuf,
}

/// Configured paths win; empty or missing values fall back to Rustory's own
/// defaults of `<appDataDir>/VSInstances` and `<appDataDir>/VSVersions`.
fn resolve_paths(config: Option<&RustoryConfig>) -> Option<RustoryPaths> {
    let base = data_candidates().into_iter().next()?;
    let instances = config
        .map(|config| config.vs_instances_path.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| base.join(INSTANCES_DIR));
    let versions = config
        .map(|config| config.vs_versions_path.trim())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| base.join(VERSIONS_DIR));
    Some(RustoryPaths {
        instances,
        versions,
    })
}

struct RustoryInstanceRow {
    file: RustoryInstanceFile,
    dir: PathBuf,
}

/// Every instance Rustory knows about (a folder with an `instance.json`).
fn read_instances(instances_root: &Path) -> Vec<RustoryInstanceRow> {
    let Ok(entries) = read_dir(instances_root) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let Ok(content) = read_to_string(dir.join(INSTANCE_FILE)) else {
            continue;
        };
        match serde_json::from_str::<RustoryInstanceFile>(&content) {
            Ok(file) => rows.push(RustoryInstanceRow { file, dir }),
            Err(error) => {
                log_error!(
                    "rustory: failed to parse {}: {error}",
                    dir.join(INSTANCE_FILE).display()
                );
            }
        }
    }
    rows.sort_by_key(|row| row.file.name.to_lowercase());
    rows
}

/// The instance's game data folder. Rustory always nests it as `Data/`.
fn data_dir_of(instance_dir: &Path) -> PathBuf {
    instance_dir.join(DATA_DIR)
}

fn count_zips(dir: &Path) -> usize {
    read_dir(dir)
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

/// Rustory's env vars are a `KEY=value` list (like VS Launcher's); split on
/// commas and newlines to tolerate either style.
fn parse_env_vars(raw: &str) -> std::collections::HashMap<String, String> {
    raw.split([',', '\n'])
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

fn migration_log_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(MIGRATION_LOG_FILE))
        .map_err(|e| UiError {
            name: "path_error".into(),
            message: format!("Failed to resolve app data dir: {e}"),
        })
}

fn read_migration_log(app: &AppHandle) -> RustoryMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &RustoryMigrationLog) -> Result<(), UiError> {
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

/// Lists Rustory instances that can be imported.
#[command]
pub async fn detect_rustory_instances(app: AppHandle) -> Result<Vec<RustoryInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Rustory scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<RustoryInstance>, UiError> {
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Ok(Vec::new());
    };
    let instances = read_instances(&paths.instances);
    if instances.is_empty() {
        return Ok(Vec::new());
    }
    log_info!(
        "rustory: reading {} ({} instances)",
        paths.instances.display(),
        instances.len()
    );

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let mut results = Vec::new();

    for row in instances {
        let path = row.dir.clone();
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }

        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });

        let data_dir = data_dir_of(&path);
        let size_bytes = dir_size_cached(&data_dir);
        results.push(RustoryInstance {
            id: row.file.id.clone(),
            name: row.file.name.clone(),
            version: row.file.version.clone(),
            path: path.to_string_lossy().to_string(),
            source: "Rustory".into(),
            mod_count: count_zips(&data_dir.join(MODS_DIR)),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: data_dir.join(SAVES_DIR).is_dir(),
            last_time_played: (row.file.last_time_played > 0)
                .then_some(row.file.last_time_played as u64),
            is_default_game_data: false,
            already_imported,
        });
    }

    log_info!("rustory: found {} instance(s)", results.len());
    Ok(results)
}

/// Imports Rustory instances into the profiles folder (copy only).
#[command]
pub async fn import_rustory_instances(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<LegacyMigrationReport, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || import_blocking(&handle, paths))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}

fn import_blocking(
    app: &AppHandle,
    requested: Vec<String>,
) -> Result<LegacyMigrationReport, UiError> {
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Err(UiError::not_found("Rustory data folder not found"));
    };
    let instances = read_instances(&paths.instances);

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
        let Some(row) = instances
            .iter()
            .find(|row| normalize_path(&row.dir) == requested_normalized)
        else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in Rustory's instances folder".into(),
            });
            continue;
        };

        let source = row.dir.clone();
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: "instance folder no longer exists".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let folder = match safe_file_name(&row.file.name) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => super::utils::dir_name(&source),
        };
        let target = free_profile_dir(&profiles_root, &folder);
        if let Err(reason) = copy_instance(&profiles_root, &source, &target) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason,
            });
            continue;
        }

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: row.file.name.clone(),
            ..Default::default()
        });
        if !row.file.name.trim().is_empty() {
            info.name = row.file.name.clone();
        }
        info.version = row.file.version.clone();
        info.start_params = row.file.start_params.clone();
        info.env_vars = parse_env_vars(&row.file.env_vars);
        if row.file.mesa_gl_thread {
            info.env_vars
                .insert("MESA_GLTHREAD".to_string(), "true".to_string());
        }
        info.last_played =
            (row.file.last_time_played > 0).then_some(row.file.last_time_played as u64);
        info.total_time_played = (row.file.total_time_played.max(0) / 1000) as u64;

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("rustory: imported {} (copy)", info.name);
        log.migrations.push(RustoryMigrationEntry {
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

/// Copies the instance's `Data/` into a fresh profile folder, staging inside
/// the profiles root so a partial copy never looks like a finished profile.
fn copy_instance(profiles_root: &Path, instance_dir: &Path, target: &Path) -> Result<(), String> {
    let staging = profiles_root.join(format!(".staging-{}", now_nanos()));
    create_dir_all(&staging).map_err(|e| format!("failed to create staging folder: {e}"))?;

    let result = (|| -> Result<(), String> {
        let staged_profile = staging.join("profile");
        create_dir_all(&staged_profile)
            .map_err(|e| format!("failed to create the profile folder: {e}"))?;

        let data_dir = data_dir_of(instance_dir);
        if data_dir.is_dir() {
            copy_dir_contents(&data_dir, &staged_profile)?;
        }

        rename(&staged_profile, target)
            .map_err(|e| format!("failed to move the copied instance into place: {e}"))
    })();

    let _ = remove_dir_all(&staging);
    result
}

/// Game builds installed by Rustory (`<vsVersionsPath>/<version>`), ready to
/// be linked into Story Forge.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Vec::new();
    };
    let Ok(entries) = read_dir(&paths.versions) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() || !super::versions::looks_like_game_dir(&path) {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.is_empty() || !name.chars().any(|c| c.is_ascii_digit()) {
                return None;
            }
            Some(super::versions::DetectedVersion {
                name,
                path: path.to_string_lossy().to_string(),
                source: "Rustory".into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rustory_config_and_defaults_paths() {
        let config: RustoryConfig = serde_json::from_str(
            r#"{
                "theme": "dark",
                "locale": "en-EN",
                "scale": 1,
                "logLevel": "info",
                "vsInstancesPath": "/games/rustory/instances",
                "vsVersionsPath": "/games/rustory/versions"
            }"#,
        )
        .unwrap();
        let paths = resolve_paths(Some(&config)).unwrap();
        assert_eq!(paths.instances, PathBuf::from("/games/rustory/instances"));
        assert_eq!(paths.versions, PathBuf::from("/games/rustory/versions"));

        // Empty values fall back to the platform data dir defaults.
        let paths = resolve_paths(Some(&RustoryConfig::default())).unwrap();
        assert!(paths.instances.ends_with("xyz.rustory.app/VSInstances"));
        assert!(paths.versions.ends_with("xyz.rustory.app/VSVersions"));
    }

    #[test]
    fn deserializes_instance_json_with_defaults() {
        let file: RustoryInstanceFile = serde_json::from_str(
            r#"{
                "id": "9c8f2a10",
                "name": "Redwood",
                "version": "1.21.3",
                "startParams": "--foo bar",
                "envVars": "A=1,B=2",
                "mesaGlThread": true,
                "lastTimePlayed": 1700000000000,
                "totalTimePlayed": 3600000
            }"#,
        )
        .unwrap();
        assert_eq!(file.name, "Redwood");
        assert_eq!(file.version, "1.21.3");
        assert!(file.mesa_gl_thread);
        assert_eq!(file.total_time_played / 1000, 3600);
        assert_eq!(parse_env_vars(&file.env_vars).len(), 2);

        let bare: RustoryInstanceFile = serde_json::from_str(r#"{"name":"Only a name"}"#).unwrap();
        assert_eq!(bare.id, "");
        assert_eq!(bare.last_time_played, 0);
    }

    #[test]
    fn reads_instances_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("VSInstances");
        let instance = root.join("Redwood");
        std::fs::create_dir_all(instance.join("Data/Saves")).unwrap();
        std::fs::create_dir_all(instance.join("Data/Mods")).unwrap();
        std::fs::create_dir_all(instance.join("Backups")).unwrap();
        std::fs::write(
            instance.join(INSTANCE_FILE),
            r#"{"id":"abc","name":"Redwood","version":"1.21.3"}"#,
        )
        .unwrap();
        std::fs::write(instance.join("Data/Mods/a.zip"), b"zip").unwrap();

        let rows = read_instances(&root);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].file.name, "Redwood");
        let data_dir = data_dir_of(&rows[0].dir);
        assert!(data_dir.join("Saves").is_dir());
        assert_eq!(count_zips(&data_dir.join(MODS_DIR)), 1);
    }

    #[test]
    fn splits_env_vars_on_commas_and_newlines() {
        let parsed = parse_env_vars("A=1,B = two\nC=3,,=nope\nNOEQUALS");
        assert_eq!(parsed.get("A").map(String::as_str), Some("1"));
        assert_eq!(parsed.get("B").map(String::as_str), Some("two"));
        assert_eq!(parsed.get("C").map(String::as_str), Some("3"));
        assert_eq!(parsed.len(), 3);
    }
}
