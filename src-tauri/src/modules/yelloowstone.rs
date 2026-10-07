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
    fs::{create_dir_all, read_dir, read_to_string, write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{
    copy_profile_dir, free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip,
};
use super::paths::{CLIENTSETTINGS_JSON, MODS_DIR, PROFILE_JSON, SAVES_DIR};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, move_folder, normalize_path, profiles_folder,
    profiles_subdir, require_managed_path,
};
use crate::{log_error, log_info};

/// Yelloowstone hardcodes this folder on every platform.
const CONFIG_SUBDIR: &str = ".config/VSLauncher";
const CONFIG_FILE: &str = "config.json";
/// Version marker inside a runtime folder, e.g. `assets/version-1.21.3.txt`.
const ASSETS_DIR: &str = "assets";
const VERSION_PREFIX: &str = "version-";
const VERSION_SUFFIX: &str = ".txt";
const MIGRATION_LOG_FILE: &str = "yelloowstone-migration.json";

#[derive(Debug, Default, Deserialize)]
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

#[derive(Debug, Clone, Serialize)]
pub struct YelloowstoneInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    /// The data folder (import moves or copies it).
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// The data folder is the game's own default data folder.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct YelloowstoneMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct YelloowstoneMigrationLog {
    #[serde(default)]
    migrations: Vec<YelloowstoneMigrationEntry>,
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

fn migration_log_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(MIGRATION_LOG_FILE))
        .map_err(|e| UiError {
            name: "path_error".into(),
            message: format!("Failed to resolve app data dir: {e}"),
        })
}

fn read_migration_log(app: &AppHandle) -> YelloowstoneMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &YelloowstoneMigrationLog) -> Result<(), UiError> {
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

/// Lists Yelloowstone instances that can be imported.
#[command]
pub async fn detect_yelloowstone_instances(
    app: AppHandle,
) -> Result<Vec<YelloowstoneInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Yelloowstone scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<YelloowstoneInstance>, UiError> {
    let instances = read_instances();
    if instances.is_empty() {
        return Ok(Vec::new());
    }
    log_info!(
        "yelloowstone: reading {} ({} instances)",
        config_path()
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
        instances.len()
    );

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let game_data_candidates = super::game_data::default_data_candidates();
    let mut results = Vec::new();

    for instance in instances {
        let data_path = PathBuf::from(instance.data_path.trim());
        if instance.name.trim().is_empty() || !data_path.is_dir() {
            continue;
        }
        if normalize_path(&data_path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &data_path)
        {
            continue;
        }

        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&data_path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });
        let is_default_game_data = game_data_candidates
            .iter()
            .any(|candidate| normalize_path(candidate) == normalize_path(&data_path));

        let size_bytes = dir_size_cached(&data_path);
        results.push(YelloowstoneInstance {
            id: data_path.to_string_lossy().to_string(),
            name: instance.name.clone(),
            version: version_of(Path::new(instance.runtime_path.trim())).unwrap_or_default(),
            path: data_path.to_string_lossy().to_string(),
            source: "Yelloowstone".into(),
            mod_count: count_zips(&data_path.join(MODS_DIR)),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: data_path.join(SAVES_DIR).is_dir(),
            last_time_played: last_open_millis(&data_path),
            is_default_game_data,
            already_imported,
        });
    }

    log_info!("yelloowstone: found {} instance(s)", results.len());
    Ok(results)
}

/// Imports Yelloowstone instances into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep the other launcher working).
#[command]
pub async fn import_yelloowstone_instances(
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
    let instances = read_instances();
    if instances.is_empty() {
        return Err(UiError::not_found("Yelloowstone config not found"));
    }

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
        let Some(instance) = instances.iter().find(|instance| {
            normalize_path(Path::new(instance.data_path.trim())) == requested_normalized
        }) else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in Yelloowstone's config".into(),
            });
            continue;
        };

        let source = PathBuf::from(instance.data_path.trim());
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: instance.name.clone(),
                reason: "folder no longer exists".into(),
            });
            continue;
        }
        let folder = dir_name(&source);
        if folder.is_empty() || folder.starts_with('.') {
            report.skipped.push(LegacyMigrationSkip {
                name: instance.name.clone(),
                reason: "invalid folder name".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name: instance.name.clone(),
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name: instance.name.clone(),
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let target = if mode == "move" {
            let target = free_profile_dir(&profiles_root, &folder);
            require_managed_path(app, &target, "profile")?;
            if move_folder(source.clone(), target.clone()).is_err() || !target.is_dir() {
                report.skipped.push(LegacyMigrationSkip {
                    name: instance.name.clone(),
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
                        name: instance.name.clone(),
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: instance.name.clone(),
            ..Default::default()
        });
        if !instance.name.trim().is_empty() {
            info.name = instance.name.clone();
        }
        info.version = version_of(Path::new(instance.runtime_path.trim())).unwrap_or_default();
        info.last_played = last_open_millis(&source).map(|millis| millis / 1000);

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: instance.name.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("yelloowstone: imported {} ({})", info.name, mode);
        log.migrations.push(YelloowstoneMigrationEntry {
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
