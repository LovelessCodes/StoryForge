//! Import of GruntLauncher (renarin-kholin) instances as Story Forge profiles.
//!
//! GruntLauncher keeps its settings in a `config.toml` under the platform
//! config dir (`~/.config/gruntlauncher` on Linux,
//! `~/Library/Application Support/com.renarin.gruntlauncher` on macOS,
//! `%APPDATA%\renarin\gruntlauncher\config` on Windows) with the folder
//! overrides `instances_folder` and `installations_folder`, both defaulting
//! to the platform data dir.
//!
//! Each instance is `<instances_folder>/<uuid>/` and holds an
//! `instance.toml` with the name, the game version (including the path of a
//! manually added install) and the installed mods. The folder itself is the
//! game data path — mods sit in `<instance>/Mods`, settings in
//! `<instance>/clientsettings.json` — so import is the usual move/copy.
//! `instance.toml` and the mod logo cache are removed from the profile
//! afterwards. Installs under `<installations_folder>/<version>` and the
//! local install paths named by instances can be linked in place.

use std::{
    fs::{create_dir_all, read_dir, read_to_string, write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{
    copy_profile_dir, free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip,
};
use super::paths::{MODS_DIR, PROFILE_JSON, SAVES_DIR};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, move_folder, normalize_path, profiles_folder,
    profiles_subdir, require_managed_path,
};
use crate::{log_error, log_info};

const CONFIG_FILE: &str = "config.toml";
const INSTANCE_FILE: &str = "instance.toml";
/// Mod logo cache GruntLauncher keeps next to the instance.
const LOGOS_DIR: &str = "Logos";
const MIGRATION_LOG_FILE: &str = "gruntlauncher-migration.json";

#[derive(Debug, Default, Deserialize)]
struct GruntConfig {
    #[serde(default)]
    instances_folder: Option<PathBuf>,
    #[serde(default)]
    installations_folder: Option<PathBuf>,
}

#[derive(Debug, Default, Deserialize)]
struct GruntInstanceFile {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: GruntVersion,
}

#[derive(Debug, Default, Deserialize)]
struct GruntVersion {
    #[serde(default)]
    version: String,
    /// `GameVersionSource`, either `{ Local = { path = … } }` or a remote
    /// entry; only the local path is of interest for linking.
    #[serde(default)]
    source: Option<toml::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GruntLauncherInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    /// The instance folder (import moves or copies the whole folder).
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// Always false: instances live inside GruntLauncher's own folder.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GruntMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct GruntMigrationLog {
    #[serde(default)]
    migrations: Vec<GruntMigrationEntry>,
}

/// The `ProjectDirs` config root for `com.renarin.gruntlauncher`.
fn config_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = super::utils::home_dir() {
        dirs.push(home.join("Library/Application Support/com.renarin.gruntlauncher"));
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        dirs.push(appdata.join("renarin/gruntlauncher/config"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| super::utils::home_dir().map(|home| home.join(".config")));
        if let Some(base) = base {
            dirs.push(base.join("gruntlauncher"));
        }
    }

    dirs
}

/// The `ProjectDirs` data root (where the default folders live).
fn data_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "macos")]
    if let Some(home) = super::utils::home_dir() {
        dirs.push(home.join("Library/Application Support/com.renarin.gruntlauncher"));
    }

    #[cfg(target_os = "windows")]
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        dirs.push(appdata.join("renarin/gruntlauncher/data"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| super::utils::home_dir().map(|home| home.join(".local/share")));
        if let Some(base) = base {
            dirs.push(base.join("gruntlauncher"));
        }
    }

    dirs
}

fn read_config() -> Option<GruntConfig> {
    for dir in config_dirs() {
        let path = dir.join(CONFIG_FILE);
        if !path.is_file() {
            continue;
        }
        let Ok(content) = read_to_string(&path) else {
            continue;
        };
        match toml::from_str::<GruntConfig>(&content) {
            Ok(config) => return Some(config),
            Err(error) => {
                log_error!("gruntlauncher: failed to parse {}: {error}", path.display());
            }
        }
    }
    None
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GruntPaths {
    instances: PathBuf,
    installations: PathBuf,
}

fn resolve_paths(config: Option<&GruntConfig>) -> Option<GruntPaths> {
    let base = data_dirs().into_iter().next()?;
    let instances = config
        .and_then(|config| config.instances_folder.clone())
        .unwrap_or_else(|| base.join("instances"));
    let installations = config
        .and_then(|config| config.installations_folder.clone())
        .unwrap_or_else(|| base.join("installations"));
    Some(GruntPaths {
        instances,
        installations,
    })
}

/// The local install path of an instance's game version, if it names one.
fn local_version_path(source: &Option<toml::Value>) -> Option<PathBuf> {
    let path = source.as_ref()?.get("Local")?.get("path")?.as_str()?;
    let path = PathBuf::from(path);
    (!path.as_os_str().is_empty()).then_some(path)
}

struct GruntInstanceRow {
    file: GruntInstanceFile,
    dir: PathBuf,
}

fn read_instances(instances_root: &Path) -> Vec<GruntInstanceRow> {
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
        match toml::from_str::<GruntInstanceFile>(&content) {
            Ok(file) => rows.push(GruntInstanceRow { file, dir }),
            Err(error) => {
                log_error!(
                    "gruntlauncher: failed to parse {}: {error}",
                    dir.join(INSTANCE_FILE).display()
                );
            }
        }
    }
    rows.sort_by_key(|row| row.file.name.to_lowercase());
    rows
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

fn read_migration_log(app: &AppHandle) -> GruntMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &GruntMigrationLog) -> Result<(), UiError> {
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

/// Lists GruntLauncher instances that can be imported.
#[command]
pub async fn detect_gruntlauncher_instances(
    app: AppHandle,
) -> Result<Vec<GruntLauncherInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("GruntLauncher scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<GruntLauncherInstance>, UiError> {
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Ok(Vec::new());
    };
    let instances = read_instances(&paths.instances);
    if instances.is_empty() {
        return Ok(Vec::new());
    }
    log_info!(
        "gruntlauncher: reading {} ({} instances)",
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

        let size_bytes = dir_size_cached(&path);
        results.push(GruntLauncherInstance {
            id: row.file.id.clone(),
            name: row.file.name.clone(),
            version: row.file.version.version.clone(),
            path: path.to_string_lossy().to_string(),
            source: "GruntLauncher".into(),
            mod_count: count_zips(&path.join(MODS_DIR)),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: path.join(SAVES_DIR).is_dir(),
            last_time_played: None,
            is_default_game_data: false,
            already_imported,
        });
    }

    log_info!("gruntlauncher: found {} instance(s)", results.len());
    Ok(results)
}

/// Imports GruntLauncher instances into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep the other launcher working).
#[command]
pub async fn import_gruntlauncher_instances(
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
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Err(UiError::not_found("GruntLauncher data folder not found"));
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
                reason: "not listed in GruntLauncher's instances folder".into(),
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
        let folder = dir_name(&source);
        if folder.is_empty() || folder.starts_with('.') {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: "invalid folder name".into(),
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

        let target = if mode == "move" {
            let target = free_profile_dir(&profiles_root, &folder);
            require_managed_path(app, &target, "profile")?;
            if move_folder(source.clone(), target.clone()).is_err() || !target.is_dir() {
                report.skipped.push(LegacyMigrationSkip {
                    name: row.file.name.clone(),
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
                        name: row.file.name.clone(),
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        // GruntLauncher's own files are not part of a Story Forge profile.
        let _ = std::fs::remove_file(target.join(INSTANCE_FILE));
        let _ = std::fs::remove_dir_all(target.join(LOGOS_DIR));

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: row.file.name.clone(),
            ..Default::default()
        });
        if !row.file.name.trim().is_empty() {
            info.name = row.file.name.clone();
        }
        info.version = row.file.version.version.clone();

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.file.name.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("gruntlauncher: imported {} ({})", info.name, mode);
        log.migrations.push(GruntMigrationEntry {
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

/// Game builds installed by GruntLauncher: the version folders under
/// `<installations_folder>` plus the local install paths instances name.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Some(paths) = resolve_paths(read_config().as_ref()) else {
        return Vec::new();
    };
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
    let mut detections = Vec::new();

    let mut take = |name: String, path: PathBuf| {
        if name.is_empty()
            || !super::versions::looks_like_game_dir(&path)
            || !seen.insert(normalize_path(&path))
        {
            return;
        }
        detections.push(super::versions::DetectedVersion {
            name,
            path: path.to_string_lossy().to_string(),
            source: "GruntLauncher".into(),
        });
    };

    if let Ok(entries) = read_dir(&paths.installations) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            // `load_local_versions` parses the folder name as semver.
            if semver::Version::parse(&name).is_err() {
                continue;
            }
            take(name, path);
        }
    }

    for row in read_instances(&paths.instances) {
        let Some(path) = local_version_path(&row.file.version.source) else {
            continue;
        };
        take(row.file.version.version.clone(), path);
    }

    detections
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_config_and_resolves_defaults() {
        let config: GruntConfig = toml::from_str(
            r#"
            instances_folder = "/games/grunt/instances"
            installations_folder = "/games/grunt/installations"
            "#,
        )
        .unwrap();
        let paths = resolve_paths(Some(&config)).unwrap();
        assert_eq!(paths.instances, PathBuf::from("/games/grunt/instances"));
        assert_eq!(
            paths.installations,
            PathBuf::from("/games/grunt/installations")
        );

        let paths = resolve_paths(Some(&GruntConfig::default())).unwrap();
        assert_eq!(paths.instances.file_name().unwrap(), "instances");
        assert_eq!(paths.installations.file_name().unwrap(), "installations");
        // The parent is the platform data dir (the crate id differs per OS).
        let parent = paths.instances.parent().unwrap().file_name().unwrap();
        assert!(parent.to_string_lossy().contains("gruntlauncher"));
    }

    #[test]
    fn parses_instance_toml_with_local_version_source() {
        let file: GruntInstanceFile = toml::from_str(
            r#"
            name = "Redwood"
            id = "123e4567-e89b-12d3-a456-426614174000"

            [[mods]]
            file = "/games/grunt/instances/abc/Mods/a.zip"

            [version]
            version = "1.21.5"

            [version.source.Local]
            path = "/games/grunt/installations/1.21.5"
            "#,
        )
        .unwrap();
        assert_eq!(file.name, "Redwood");
        assert_eq!(file.version.version, "1.21.5");
        assert_eq!(
            local_version_path(&file.version.source),
            Some(PathBuf::from("/games/grunt/installations/1.21.5"))
        );
    }

    #[test]
    fn remote_version_sources_have_no_local_path() {
        let file: GruntInstanceFile = toml::from_str(
            r#"
            name = "Redwood"
            [version]
            version = "1.21.5"
            [version.source.Remote]
            filename = "vs_client_linux-x64_1.21.5.tar.gz"
            url = "https://example.invalid/vs.tar.gz"
            checksum = "abc"
            "#,
        )
        .unwrap();
        assert_eq!(local_version_path(&file.version.source), None);
    }

    #[test]
    fn reads_instances_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("instances");
        let instance = root.join("123e4567");
        std::fs::create_dir_all(instance.join("Mods")).unwrap();
        std::fs::create_dir_all(instance.join("Logos")).unwrap();
        std::fs::create_dir_all(instance.join("Saves")).unwrap();
        std::fs::write(
            instance.join(INSTANCE_FILE),
            "name = \"Redwood\"\n[version]\nversion = \"1.21.5\"\n",
        )
        .unwrap();
        std::fs::write(instance.join("Mods/a.zip"), b"zip").unwrap();

        let rows = read_instances(&root);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].file.name, "Redwood");
        assert_eq!(count_zips(&rows[0].dir.join(MODS_DIR)), 1);
    }
}
