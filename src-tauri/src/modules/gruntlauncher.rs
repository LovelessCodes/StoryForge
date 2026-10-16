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
use super::utils::{dir_size_cached, normalize_path};
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

#[derive(Debug, Clone, Default, Deserialize)]
struct GruntInstanceFile {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: GruntVersion,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct GruntVersion {
    #[serde(default)]
    version: String,
    /// `GameVersionSource`, either `{ Local = { path = … } }` or a remote
    /// entry; only the local path is of interest for linking.
    #[serde(default)]
    source: Option<toml::Value>,
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

#[derive(Debug, Clone)]
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

/// What GruntLauncher contributes to the shared import driver.
struct GruntLauncherSource;

impl ImportSource for GruntLauncherSource {
    type Item = GruntInstanceRow;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "gruntlauncher"
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
            "gruntlauncher: reading {} ({} instances)",
            paths.instances.display(),
            instances.len()
        );
        Ok(Some(instances))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("GruntLauncher data folder not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in GruntLauncher's instances folder"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "instance folder no longer exists"
    }

    fn describe(&self, row: &GruntInstanceRow, log: &MigrationLog) -> DetectedInstance {
        let path = row.dir.clone();
        let bytes = dir_size_cached(&path);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: row.file.id.clone(),
            name: row.file.name.clone(),
            version: row.file.version.version.clone(),
            path: path.to_string_lossy().to_string(),
            source: "GruntLauncher".into(),
            mod_count: count_mod_zips(&path.join(MODS_DIR)),
            size_bytes,
            size_display,
            has_saves: has_saves(&path),
            last_time_played: None,
            is_default_game_data: false,
            already_imported: is_already_imported(log, &path),
        }
    }

    fn source_path(&self, row: &GruntInstanceRow) -> PathBuf {
        row.dir.clone()
    }

    fn display_name(&self, row: &GruntInstanceRow) -> String {
        row.file.name.clone()
    }

    fn validates_folder_name(&self) -> bool {
        true
    }

    fn placement(&self) -> Placement {
        Placement::WholeDir
    }

    fn apply_profile(&self, row: &GruntInstanceRow, info: &mut ProfileInfo) {
        if !row.file.name.trim().is_empty() {
            info.name = row.file.name.clone();
        }
        info.version = row.file.version.version.clone();
    }

    fn post_place(
        &self,
        _app: &AppHandle,
        _row: &GruntInstanceRow,
        target: &Path,
    ) -> Result<(), UiError> {
        // GruntLauncher's own files are not part of a Story Forge profile.
        let _ = std::fs::remove_file(target.join(INSTANCE_FILE));
        let _ = std::fs::remove_dir_all(target.join(LOGOS_DIR));
        Ok(())
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::PerFolder
    }
}

/// Lists GruntLauncher instances that can be imported.
#[command]
pub async fn detect_gruntlauncher_instances(
    app: AppHandle,
) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &GruntLauncherSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("GruntLauncher scan failed: {e}")))?
}

/// Imports GruntLauncher instances into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep the other launcher working).
#[command]
pub async fn import_gruntlauncher_instances(
    app: AppHandle,
    paths: Vec<String>,
    mode: String,
    emitevent: Option<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, GruntLauncherSource, paths, Some(mode), emitevent).await
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
        assert_eq!(count_mod_zips(&rows[0].dir.join(MODS_DIR)), 1);
    }
}
