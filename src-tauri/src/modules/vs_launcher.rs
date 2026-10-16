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
    fs::read_to_string,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::importer::{
    count_mod_zips, detect_all, has_saves, is_already_imported, is_default_game_data, run_import,
    size_fields, DetectedInstance, ImportReport, ImportSource, LogWrite, MigrationLog, Placement,
};
use super::paths::MODS_DIR;
use super::profiles::ProfileInfo;
use super::utils::{dir_size_cached, normalize_path};
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

#[derive(Debug, Clone, Deserialize)]
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

/// One installation plus the family member that listed it.
#[derive(Debug, Clone)]
struct VsRow {
    source: &'static str,
    installation: VsInstallation,
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

/// What the VS Launcher family contributes to the shared import driver.
struct VsLauncherSource;

impl ImportSource for VsLauncherSource {
    type Item = VsRow;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "vs_launcher"
    }

    fn found_noun(&self) -> &'static str {
        "installation(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let configs = read_family_configs();
        if configs.is_empty() {
            return Ok(None);
        }
        for (path, source, _config) in &configs {
            log_info!("vs_launcher: reading {} ({})", path.display(), source);
        }
        Ok(Some(
            configs
                .into_iter()
                .flat_map(|(_path, source, config)| {
                    config
                        .installations
                        .into_iter()
                        .map(move |installation| VsRow {
                            source,
                            installation,
                        })
                })
                .collect(),
        ))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("No VS Launcher or RiftLauncher config found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in the VS Launcher or RiftLauncher config"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "folder no longer exists"
    }

    fn detectable(&self, item: &VsRow) -> bool {
        !item.installation.name.trim().is_empty()
            && !item.installation.path.trim().is_empty()
            && PathBuf::from(&item.installation.path).is_dir()
    }

    fn dedupes_detected_paths(&self) -> bool {
        true
    }

    fn stops_detect_when_empty(&self) -> bool {
        false
    }

    fn sorts_detected_names(&self) -> bool {
        true
    }

    fn describe(&self, item: &VsRow, log: &MigrationLog) -> DetectedInstance {
        let installation = &item.installation;
        let path = PathBuf::from(&installation.path);
        let bytes = dir_size_cached(&path);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: installation.id.clone(),
            name: installation.name.clone(),
            version: installation.version.clone(),
            path: installation.path.clone(),
            source: item.source.into(),
            mod_count: count_mod_zips(&path.join(MODS_DIR)),
            size_bytes,
            size_display,
            has_saves: has_saves(&path),
            last_time_played: (installation.last_time_played > 0)
                .then_some(installation.last_time_played as u64),
            is_default_game_data: is_default_game_data(&path),
            already_imported: is_already_imported(log, &path),
        }
    }

    fn source_path(&self, item: &VsRow) -> PathBuf {
        PathBuf::from(&item.installation.path)
    }

    fn display_name(&self, item: &VsRow) -> String {
        item.installation.name.clone()
    }

    fn validates_folder_name(&self) -> bool {
        true
    }

    fn placement(&self) -> Placement {
        Placement::WholeDir
    }

    fn apply_profile(&self, item: &VsRow, info: &mut ProfileInfo) {
        if !item.installation.name.trim().is_empty() {
            info.name = item.installation.name.clone();
        }
        info.version = item.installation.version.clone();
        info.start_params = item.installation.start_params.clone();
        info.last_played = (item.installation.last_time_played > 0)
            .then_some(item.installation.last_time_played as u64);
        info.total_time_played = (item.installation.total_time_played.max(0) / 1000) as u64;
        info.env_vars = parse_env_vars(&item.installation.env_vars);
        if item.installation.mesa_gl_thread {
            info.env_vars
                .insert("MESA_GLTHREAD".to_string(), "true".to_string());
        }
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::PerFolder
    }
}

/// Lists VS Launcher installations that can be imported.
#[command]
pub async fn detect_vs_launcher_installations(
    app: AppHandle,
) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &VsLauncherSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("VS Launcher scan failed: {e}")))?
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
    emitevent: Option<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, VsLauncherSource, paths, Some(mode), emitevent).await
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
