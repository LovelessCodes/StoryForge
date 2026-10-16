//! Import of Yelloowstone (jgwoolley/vintage-story-launcher) instances as
//! Story Forge profiles.
//!
//! Yelloowstone is a JavaFX launcher that keeps a JSON **array** of instances
//! in `~/.config/VSLauncher/config.json` (all platforms — its `user.home` plus
//! `.config/VSLauncher`):
//!
//! ```json
//! [{ "name": "…", "runtimePath": "…/VS_1.21.3", "dataPath": "…/InstanceA" }]
//! ```
//!
//! The runtime path is a game install (its version is read from
//! `assets/version-<version>.txt`) and can be linked in place; the data path
//! is the game data folder with `Mods/` and `Saves/`, the same shape as a
//! profile, so import is the usual move/copy.
//!
//! On Linux VS Launcher (XurxoMF) writes a config **object** to the same
//! path; the array form is Yelloowstone's, and each importer skips the other
//! shape without a parse error.

use std::{
    fs::{read_dir, read_to_string},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Deserialize;
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::importer::{
    count_mod_zips, detect_all, has_saves, is_already_imported, is_default_game_data, run_import,
    size_fields, DetectedInstance, ImportReport, ImportSource, LogWrite, MigrationLog, Placement,
};
use super::paths::{CLIENTSETTINGS_JSON, MODS_DIR};
use super::profiles::ProfileInfo;
use super::utils::{dir_size_cached, normalize_path};
use crate::{log_error, log_info};

/// Yelloowstone hardcodes this folder on every platform.
const CONFIG_SUBDIR: &str = ".config/VSLauncher";
const CONFIG_FILE: &str = "config.json";
/// Version marker inside a runtime folder, e.g. `assets/version-1.21.3.txt`.
const ASSETS_DIR: &str = "assets";
const VERSION_PREFIX: &str = "version-";
const VERSION_SUFFIX: &str = ".txt";
const MIGRATION_LOG_FILE: &str = "yelloowstone-migration.json";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YelloowstoneInstanceFile {
    #[serde(default)]
    name: String,
    /// The game install this instance runs.
    #[serde(default)]
    runtime_path: String,
    /// The game data folder (the profile-shaped part).
    #[serde(default)]
    data_path: String,
}

fn config_path() -> Option<PathBuf> {
    super::utils::home_dir().map(|home| home.join(CONFIG_SUBDIR).join(CONFIG_FILE))
}

/// The instances in the config, or nothing when the file is missing or holds
/// VS Launcher's object shape instead of Yelloowstone's array.
fn read_instances() -> Vec<YelloowstoneInstanceFile> {
    let Some(path) = config_path() else {
        return Vec::new();
    };
    let Ok(content) = read_to_string(&path) else {
        return Vec::new();
    };
    if !content.trim_start().starts_with('[') {
        return Vec::new();
    }
    match serde_json::from_str::<Vec<YelloowstoneInstanceFile>>(&content) {
        Ok(instances) => instances,
        Err(error) => {
            log_error!("yelloowstone: failed to parse {}: {error}", path.display());
            Vec::new()
        }
    }
}

/// The version named by `<runtimePath>/assets/version-<version>.txt`.
fn version_of(runtime_path: &Path) -> Option<String> {
    let entries = read_dir(runtime_path.join(ASSETS_DIR)).ok()?;
    let mut versions: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let version = name
                .strip_prefix(VERSION_PREFIX)?
                .strip_suffix(VERSION_SUFFIX)?;
            (!version.is_empty()).then(|| version.to_string())
        })
        .collect();
    versions.sort();
    versions.pop()
}

/// When the instance was last opened: Yelloowstone looks at the modified time
/// of `clientsettings.json` in the data folder.
fn last_open_millis(data_path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(data_path.join(CLIENTSETTINGS_JSON))
        .ok()?
        .modified()
        .ok()?;
    modified
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

/// What Yelloowstone contributes to the shared import driver.
struct YelloowstoneSource;

impl ImportSource for YelloowstoneSource {
    type Item = YelloowstoneInstanceFile;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "yelloowstone"
    }

    fn found_noun(&self) -> &'static str {
        "instance(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let instances = read_instances();
        if instances.is_empty() {
            return Ok(None);
        }
        log_info!(
            "yelloowstone: reading {} ({} instances)",
            config_path()
                .map(|path| path.display().to_string())
                .unwrap_or_default(),
            instances.len()
        );
        Ok(Some(instances))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("Yelloowstone config not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in Yelloowstone's config"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "folder no longer exists"
    }

    fn detectable(&self, item: &YelloowstoneInstanceFile) -> bool {
        !item.name.trim().is_empty() && PathBuf::from(item.data_path.trim()).is_dir()
    }

    fn describe(&self, item: &YelloowstoneInstanceFile, log: &MigrationLog) -> DetectedInstance {
        let data_path = PathBuf::from(item.data_path.trim());
        let bytes = dir_size_cached(&data_path);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: data_path.to_string_lossy().to_string(),
            name: item.name.clone(),
            version: version_of(Path::new(item.runtime_path.trim())).unwrap_or_default(),
            path: data_path.to_string_lossy().to_string(),
            source: "Yelloowstone".into(),
            mod_count: count_mod_zips(&data_path.join(MODS_DIR)),
            size_bytes,
            size_display,
            has_saves: has_saves(&data_path),
            last_time_played: last_open_millis(&data_path),
            is_default_game_data: is_default_game_data(&data_path),
            already_imported: is_already_imported(log, &data_path),
        }
    }

    fn source_path(&self, item: &YelloowstoneInstanceFile) -> PathBuf {
        PathBuf::from(item.data_path.trim())
    }

    fn display_name(&self, item: &YelloowstoneInstanceFile) -> String {
        item.name.clone()
    }

    fn validates_folder_name(&self) -> bool {
        true
    }

    fn placement(&self) -> Placement {
        Placement::WholeDir
    }

    fn apply_profile(&self, item: &YelloowstoneInstanceFile, info: &mut ProfileInfo) {
        if !item.name.trim().is_empty() {
            info.name = item.name.clone();
        }
        info.version = version_of(Path::new(item.runtime_path.trim())).unwrap_or_default();
        info.last_played =
            last_open_millis(&PathBuf::from(item.data_path.trim())).map(|millis| millis / 1000);
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::PerFolder
    }
}

/// Lists Yelloowstone instances that can be imported.
#[command]
pub async fn detect_yelloowstone_instances(
    app: AppHandle,
) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &YelloowstoneSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Yelloowstone scan failed: {e}")))?
}

/// Imports Yelloowstone instances into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep the other launcher working).
#[command]
pub async fn import_yelloowstone_instances(
    app: AppHandle,
    paths: Vec<String>,
    mode: String,
    emitevent: Option<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, YelloowstoneSource, paths, Some(mode), emitevent).await
}

/// Game installs named by Yelloowstone's instances, ready to be linked.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    read_instances()
        .into_iter()
        .filter_map(|instance| {
            let path = PathBuf::from(instance.runtime_path.trim());
            let name = version_of(&path)?;
            if !super::versions::looks_like_game_dir(&path) || !seen.insert(normalize_path(&path)) {
                return None;
            }
            Some(super::versions::DetectedVersion {
                name,
                path: path.to_string_lossy().to_string(),
                source: "Yelloowstone".into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_array_config() {
        let instances: Vec<YelloowstoneInstanceFile> = serde_json::from_str(
            r#"[
                { "name": "Redwood", "runtimePath": "/games/VS_1.21.3", "dataPath": "/data/Redwood" },
                { "name": "Only a name" }
            ]"#,
        )
        .unwrap();
        assert_eq!(instances.len(), 2);
        assert_eq!(instances[0].runtime_path, "/games/VS_1.21.3");
        assert_eq!(instances[1].data_path, "");
    }

    #[test]
    fn reads_the_version_from_the_assets_marker() {
        let dir = tempfile::tempdir().unwrap();
        let runtime = dir.path().join("VS_1.21.3");
        std::fs::create_dir_all(runtime.join(ASSETS_DIR)).unwrap();
        std::fs::write(runtime.join("Vintagestory"), b"bin").unwrap();
        std::fs::write(runtime.join(ASSETS_DIR).join("version-1.21.3.txt"), b"v").unwrap();

        assert_eq!(version_of(&runtime).as_deref(), Some("1.21.3"));
        assert!(super::super::versions::looks_like_game_dir(&runtime));

        // No marker: no version, and the folder is not linked.
        let bare = dir.path().join("bare");
        std::fs::create_dir_all(&bare).unwrap();
        assert_eq!(version_of(&bare), None);
    }

    #[test]
    fn skips_the_object_config_shape() {
        // VS Launcher's config is an object; `read_instances` only ever
        // touches the real file, so exercise the shape check directly.
        let object = r#"{"installations":[]}"#;
        assert!(!object.trim_start().starts_with('['));
        let array = r#"[{"name":"a"}]"#;
        let parsed: Vec<YelloowstoneInstanceFile> = serde_json::from_str(array).unwrap();
        assert_eq!(parsed.len(), 1);
    }
}
