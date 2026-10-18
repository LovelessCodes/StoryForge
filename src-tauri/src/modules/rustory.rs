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
    fs::{read_dir, read_to_string},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::importer::{
    count_mod_zips, detect_all, has_saves, is_already_imported, run_import, size_fields,
    DetectedInstance, ImportReport, ImportSource, LogWrite, MigrationLog, Placement,
};
use super::paths::MODS_DIR;
use super::profiles::ProfileInfo;
use super::utils::{copy_dir_contents, dir_name, dir_size_cached, safe_file_name};
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

#[derive(Debug, Clone, Default, Deserialize)]
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

#[derive(Debug, Clone)]
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

/// What Rustory contributes to the shared import driver.
struct RustorySource;

impl ImportSource for RustorySource {
    type Item = RustoryInstanceRow;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "rustory"
    }

    fn found_noun(&self) -> &'static str {
        "instance(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let Some(paths) = resolve_paths(read_config().as_ref()) else {
            return Ok(None);
        };
        let instances = read_instances(&paths.instances);
        if instances.is_empty() {
            return Ok(Some(instances));
        }
        log_info!(
            "rustory: reading {} ({} instances)",
            paths.instances.display(),
            instances.len()
        );
        Ok(Some(instances))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("Rustory data folder not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in Rustory's instances folder"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "instance folder no longer exists"
    }

    fn describe(&self, row: &RustoryInstanceRow, log: &MigrationLog) -> DetectedInstance {
        let path = row.dir.clone();
        let data_dir = data_dir_of(&path);
        let bytes = dir_size_cached(&data_dir);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: row.file.id.clone(),
            name: row.file.name.clone(),
            version: row.file.version.clone(),
            path: path.to_string_lossy().to_string(),
            source: "Rustory".into(),
            mod_count: count_mod_zips(&data_dir.join(MODS_DIR)),
            size_bytes,
            size_display,
            has_saves: has_saves(&data_dir),
            last_time_played: (row.file.last_time_played > 0)
                .then_some(row.file.last_time_played as u64),
            is_default_game_data: false,
            already_imported: is_already_imported(log, &path),
        }
    }

    fn source_path(&self, row: &RustoryInstanceRow) -> PathBuf {
        row.dir.clone()
    }

    fn display_name(&self, row: &RustoryInstanceRow) -> String {
        row.file.name.clone()
    }

    fn target_folder(&self, row: &RustoryInstanceRow) -> String {
        match safe_file_name(&row.file.name) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => dir_name(&row.dir),
        }
    }

    fn placement(&self) -> Placement {
        Placement::Selective
    }

    fn stage(
        &self,
        _app: &AppHandle,
        row: &RustoryInstanceRow,
        profile_dir: &Path,
    ) -> Result<(), UiError> {
        let data_dir = data_dir_of(&row.dir);
        if data_dir.is_dir() {
            copy_dir_contents(&data_dir, profile_dir)
                .map_err(|e| UiError::new("copy_failed", e))?;
        }
        Ok(())
    }

    fn staged_noun(&self) -> &'static str {
        "instance"
    }

    fn apply_profile(&self, row: &RustoryInstanceRow, info: &mut ProfileInfo) {
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
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::AtEnd
    }
}

/// Lists Rustory instances that can be imported.
#[command]
pub async fn detect_rustory_instances(app: AppHandle) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &RustorySource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Rustory scan failed: {e}")))?
}

/// Imports Rustory instances into the profiles folder (copy only).
#[command]
pub async fn import_rustory_instances(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, RustorySource, paths, None, None).await
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
        assert_eq!(count_mod_zips(&data_dir.join(MODS_DIR)), 1);
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
