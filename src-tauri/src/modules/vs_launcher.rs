//! Import of VS Launcher / RiftLauncher installations as Story Forge profiles.
//!
//! RiftLauncher is the maintained continuation of VS Launcher (which it forks)
//! and keeps the same config format in `<appData>/RiftLauncher/config.json`;
//! VS Launcher keeps its own in `<appData>/VSLauncher/config.json`, and
//! RiftLauncher copies that data over on first run, so both may exist and
//! describe the same folders.
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
    collections::{HashMap, HashSet},
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
use crate::{log_error, log_info};

/// Launchers sharing this config format, most authoritative first.
///
/// RiftLauncher is the maintained continuation of VS Launcher and copies VS
/// Launcher's data over on first run, so both configs can exist side by side
/// and describe the same installation paths; the first match wins.
const FAMILY: [(&str, &str); 2] = [
    ("RiftLauncher", "RiftLauncher"),
    ("VSLauncher", "VS Launcher"),
];
const MIGRATION_LOG_FILE: &str = "vs-launcher-migration.json";

#[derive(Debug, Deserialize)]
struct VsConfig {
    #[serde(default)]
    installations: Vec<VsInstallation>,
    #[serde(default, rename = "gameVersions", alias = "game_versions")]
    game_versions: Vec<VsGameVersion>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VsGameVersion {
    #[serde(default)]
    version: String,
    #[serde(default)]
    path: String,
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
    /// Which family member listed it ("VS Launcher" or "RiftLauncher").
    pub source: String,
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

/// `<OS app-config dir>/<launcher>/config.json` for every family member.
fn family_config_paths() -> Vec<(PathBuf, &'static str)> {
    super::utils::platform_config_dirs()
        .into_iter()
        .flat_map(|base| {
            FAMILY
                .iter()
                .map(move |(folder, source)| (base.join(folder).join("config.json"), *source))
        })
        .collect()
}

fn read_family_configs() -> Vec<(PathBuf, &'static str, VsConfig)> {
    family_config_paths()
        .into_iter()
        .filter_map(|(path, source)| {
            if !path.is_file() {
                return None;
            }
            let content = read_to_string(&path).ok()?;
            // On Linux Yelloowstone keeps a JSON array at the same path (its
            // own importer reads that shape); skip it without a parse error.
            if content.trim_start().starts_with('[') {
                return None;
            }
            match serde_json::from_str::<VsConfig>(&content) {
                Ok(config) => Some((path, source, config)),
                Err(error) => {
                    log_error!("vs_launcher: failed to parse {}: {error}", path.display());
                    None
                }
            }
        })
        .collect()
}

/// Game versions installed by the VS Launcher family, ready to be linked.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut versions = Vec::new();
    for (_path, source, config) in read_family_configs() {
        for version in game_versions_from_config(config, source) {
            if seen.insert(normalize_path(Path::new(&version.path))) {
                versions.push(version);
            }
        }
    }
    versions
}

fn game_versions_from_config(
    config: VsConfig,
    source: &str,
) -> Vec<super::versions::DetectedVersion> {
    config
        .game_versions
        .into_iter()
        .filter_map(|entry| {
            let name = entry.version.trim().to_string();
            let path = PathBuf::from(entry.path.trim());
            if name.is_empty() || !super::versions::looks_like_game_dir(&path) {
                return None;
            }
            Some(super::versions::DetectedVersion {
                name,
                path: path.to_string_lossy().to_string(),
                source: source.to_string(),
            })
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
    let configs = read_family_configs();
    if configs.is_empty() {
        return Ok(Vec::new());
    }
    for (path, source, _config) in &configs {
        log_info!("vs_launcher: reading {} ({})", path.display(), source);
    }

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let game_data_candidates = super::game_data::default_data_candidates();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut results = Vec::new();

    for (_config_path, source, config) in configs {
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
            // The family members can describe the same installation folder.
            if !seen.insert(normalize_path(&path)) {
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
                source: source.to_string(),
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
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("vs_launcher: found {} installation(s)", results.len());
    Ok(results)
}

/// Imports VS Launcher / RiftLauncher installations into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep the other launcher working).
/// Only paths listed in one of the family configs are accepted, and folder
/// name collisions import under a suffixed name.
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
    let configs = read_family_configs();
    if configs.is_empty() {
        return Err(UiError::not_found(
            "No VS Launcher or RiftLauncher config found",
        ));
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
        let Some(installation) = configs.iter().find_map(|(_path, _source, config)| {
            config
                .installations
                .iter()
                .find(|item| normalize_path(Path::new(&item.path)) == requested_normalized)
        }) else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in the VS Launcher or RiftLauncher config".into(),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vs_launcher_env_vars() {
        let parsed = parse_env_vars("KEY=value, OTHER = spaced ,EMPTY=,NOEQUALS,=novalue");
        assert_eq!(parsed.get("KEY").map(String::as_str), Some("value"));
        assert_eq!(parsed.get("OTHER").map(String::as_str), Some("spaced"));
        assert_eq!(parsed.get("EMPTY").map(String::as_str), Some(""));
        // `NOEQUALS` and `=novalue` are dropped. Unlike VS Launcher we keep
        // entries with empty values (e.g. a variable intentionally blanked).
        assert_eq!(parsed.len(), 3);
    }

    #[test]
    fn deserializes_vs_launcher_config() {
        let config: VsConfig = serde_json::from_str(
            r#"{
                "version": 1.6,
                "installations": [{
                    "id": "123e4567-e89b-12d3-a456-426614174000",
                    "name": "My World",
                    "icon": "basalt",
                    "path": "/tmp/vsl-install",
                    "version": "1.21.3",
                    "startParams": "--foo bar",
                    "backupsLimit": 3,
                    "backupsAuto": false,
                    "compressionLevel": 4,
                    "backups": [],
                    "lastTimePlayed": 1700000000000,
                    "totalTimePlayed": 3600000,
                    "mesaGlThread": true,
                    "envVars": "A=1,B=2"
                }],
                "gameVersions": [{ "version": "1.21.3", "path": "/tmp/game" }]
            }"#,
        )
        .expect("config parses");

        let installation = &config.installations[0];
        assert_eq!(installation.name, "My World");
        assert_eq!(installation.version, "1.21.3");
        assert_eq!(installation.start_params, "--foo bar");
        assert_eq!(installation.last_time_played, 1_700_000_000_000);
        assert_eq!(installation.total_time_played / 1000, 3600);
        assert!(installation.mesa_gl_thread);
        assert_eq!(parse_env_vars(&installation.env_vars).len(), 2);
    }

    #[test]
    fn defaults_missing_installation_fields() {
        let config: VsConfig =
            serde_json::from_str(r#"{"installations":[{"name":"Only a name"}]}"#).unwrap();
        let installation = &config.installations[0];
        assert_eq!(installation.path, "");
        assert_eq!(installation.last_time_played, 0);
        assert_eq!(installation.total_time_played, 0);
        assert!(!installation.mesa_gl_thread);
        assert!(installation.id.is_empty());
    }

    #[test]
    fn reads_game_versions_from_the_config() {
        let dir = tempfile::tempdir().unwrap();
        let install = dir.path().join("VSLGameVersions/1.21.3");
        std::fs::create_dir_all(&install).unwrap();
        std::fs::write(install.join("Vintagestory"), b"bin").unwrap();

        let config: VsConfig = serde_json::from_str(&format!(
            r#"{{"gameVersions":[{{"version":"1.21.3","path":"{}"}},{{"version":"missing","path":"/does/not/exist"}}]}}"#,
            install.to_string_lossy()
        ))
        .unwrap();

        let versions = game_versions_from_config(config, "RiftLauncher");
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].name, "1.21.3");
        assert_eq!(versions[0].path, install.to_string_lossy());
        assert_eq!(versions[0].source, "RiftLauncher");
    }
}
