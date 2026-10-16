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
    fs::read_to_string,
    path::{Path, PathBuf},
};

use serde_json::Value;
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::importer::{
    count_mod_zips, detect_all, has_saves, is_already_imported, run_import, size_fields,
    DetectedInstance, ImportReport, ImportSource, LogWrite, MigrationLog, Placement,
};
use super::paths::MODS_DIR;
use super::profiles::ProfileInfo;
use super::utils::{dir_name, dir_size_cached};
use crate::log_info;

/// Folder MVL uses inside Godot's user dir (`use_custom_user_dir`).
const MVL_DIR: &str = "MVL";
const MIGRATION_LOG_FILE: &str = "mvl-migration.json";

/// `<Godot user dir>/MVL/data.json`, per platform.
///
/// Godot's user dir is `%APPDATA%` on Windows, `$XDG_DATA_HOME` (usually
/// `~/.local/share`) on Linux and `~/Library/Application Support` on macOS.
pub(crate) fn config_candidates() -> Vec<PathBuf> {
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

/// What MVL contributes to the shared import driver.
struct MvlSource;

impl ImportSource for MvlSource {
    type Item = PathBuf;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "mvl"
    }

    fn found_noun(&self) -> &'static str {
        "modpack(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let Some((config_path, config)) = read_config()? else {
            return Ok(None);
        };
        log_info!("mvl: reading {}", config_path.display());
        let config_dir = config_path.parent().unwrap_or(Path::new("."));
        Ok(Some(config_modpack_paths(&config, config_dir)))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("MVL config not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in the MVL config"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "folder no longer exists"
    }

    fn detectable(&self, path: &PathBuf) -> bool {
        if !path.is_dir() {
            return false;
        }
        let folder = dir_name(path);
        !folder.is_empty() && !folder.starts_with('.')
    }

    fn stops_detect_when_empty(&self) -> bool {
        false
    }

    fn sorts_detected_names(&self) -> bool {
        true
    }

    fn describe(&self, path: &PathBuf, log: &MigrationLog) -> DetectedInstance {
        let folder = dir_name(path);
        let manifest = read_manifest(path);
        let bytes = dir_size_cached(path);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: folder.clone(),
            name: manifest_name(manifest.as_ref(), &folder),
            version: manifest_game_version(manifest.as_ref()),
            path: path.to_string_lossy().to_string(),
            source: "MVL".into(),
            mod_count: count_mod_zips(&path.join(MODS_DIR)),
            size_bytes,
            size_display,
            has_saves: has_saves(path),
            last_time_played: None,
            is_default_game_data: false,
            already_imported: is_already_imported(log, path),
        }
    }

    fn source_path(&self, path: &PathBuf) -> PathBuf {
        path.clone()
    }

    fn display_name(&self, path: &PathBuf) -> String {
        let folder = dir_name(path);
        manifest_name(read_manifest(path).as_ref(), &folder)
    }

    fn validates_folder_name(&self) -> bool {
        true
    }

    fn placement(&self) -> Placement {
        Placement::WholeDir
    }

    fn apply_profile(&self, path: &PathBuf, info: &mut ProfileInfo) {
        let folder = dir_name(path);
        let manifest = read_manifest(path);
        info.name = manifest_name(manifest.as_ref(), &folder);
        info.version = manifest_game_version(manifest.as_ref());
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::PerFolder
    }
}

/// Lists MVL modpacks that can be imported.
#[command]
pub async fn detect_mvl_modpacks(app: AppHandle) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &MvlSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("MVL scan failed: {e}")))?
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
    emitevent: Option<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, MvlSource, paths, Some(mode), emitevent).await
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
