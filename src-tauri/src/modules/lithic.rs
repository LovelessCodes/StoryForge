//! Import of Lithic (NotAShelf) instances as Story Forge profiles.
//!
//! Lithic keeps its state under `LITHIC_DATA_DIR` (else `<data dir>/lithic`,
//! with `LITHIC_CONFIG_DIR`/`LITHIC_CACHE_DIR` for the rest). Each instance
//! lives in `<data>/instances/<id>/`:
//!
//! ```text
//! instance.toml     settings (name, game_version, optional external data_dir/mods_dir)
//! data/             passed to the game as --dataPath (unless data_dir is set)
//! data/Mods/        mods the game loads
//! disabled-mods/    mods switched off in Lithic
//! ```
//!
//! Game builds are registered in `<data>/game/installs.toml` and can be
//! linked in place. Import copies the instance's data folder into a profile —
//! copy only, because the instance directory also holds Lithic's own settings
//! and lock files. Mods switched off in Lithic are copied to `mods-disabled/`
//! so they stay out of the game; launch wrappers (`gamemoderun` and similar)
//! are not carried over.

use std::{
    collections::{BTreeMap, HashSet},
    fs::{read_dir, read_to_string},
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
use super::utils::{copy_dir_contents, dir_name, dir_size_cached, safe_file_name};
use crate::{log_error, log_info};

const DATA_DIR_ENV: &str = "LITHIC_DATA_DIR";
/// Folder name under the platform data dir.
const APP_DIR: &str = "lithic";
const INSTANCES_DIR: &str = "instances";
const INSTANCE_FILE: &str = "instance.toml";
/// Default game data inside an instance directory.
const DATA_SUBDIR: &str = "data";
/// Mods switched off inside the instance directory.
const DISABLED_DIR: &str = "disabled-mods";
/// Where disabled mods are parked inside the imported profile (not loaded).
const PROFILE_DISABLED_DIR: &str = "mods-disabled";
const GAME_DIR: &str = "game";
const INSTALLS_FILE: &str = "installs.toml";
const MIGRATION_LOG_FILE: &str = "lithic-migration.json";

#[derive(Debug, Clone, Default, Deserialize)]
struct LithicInstanceFile {
    #[serde(default)]
    name: String,
    #[serde(default)]
    game_version: Option<String>,
    /// A data directory outside the instance (for example the stock
    /// `VintagestoryData`); Lithic never deletes it.
    #[serde(default)]
    data_dir: Option<PathBuf>,
    /// An extra mod folder outside the data directory (`--addModPath`).
    #[serde(default)]
    mods_dir: Option<PathBuf>,
    #[serde(default)]
    launch: LithicLaunch,
    #[serde(default)]
    stats: LithicStats,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct LithicLaunch {
    args: Vec<String>,
    env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct LithicStats {
    last_played_at: Option<i64>,
    play_time_ms: i64,
}

#[derive(Debug, Default, Deserialize)]
struct LithicRegistry {
    #[serde(default)]
    installs: Vec<LithicInstall>,
}

#[derive(Debug, Deserialize)]
struct LithicInstall {
    version: String,
    path: PathBuf,
}

/// `<data dir>/lithic`, overridable with `LITHIC_DATA_DIR`.
fn data_root() -> Option<PathBuf> {
    if let Some(value) = std::env::var_os(DATA_DIR_ENV)
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return Some(value);
    }
    super::utils::platform_data_dirs()
        .into_iter()
        .next()
        .map(|base| base.join(APP_DIR))
}

/// Resolves a path stored in `instance.toml` (absolute normally, relative to
/// the instance folder otherwise).
fn resolve_path(instance_dir: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        instance_dir.join(path)
    }
}

#[derive(Debug, Clone)]
struct LithicRow {
    file: LithicInstanceFile,
    dir: PathBuf,
}

impl LithicRow {
    /// The game data folder: the external `data_dir` when set, else `data/`.
    fn data_dir(&self) -> PathBuf {
        self.file
            .data_dir
            .as_ref()
            .map(|path| resolve_path(&self.dir, path))
            .unwrap_or_else(|| self.dir.join(DATA_SUBDIR))
    }

    /// Where the game loads mods from.
    fn mods_dir(&self) -> PathBuf {
        self.file
            .mods_dir
            .as_ref()
            .map(|path| resolve_path(&self.dir, path))
            .unwrap_or_else(|| self.data_dir().join(MODS_DIR))
    }

    fn disabled_mods_dir(&self) -> PathBuf {
        self.dir.join(DISABLED_DIR)
    }

    fn name(&self) -> String {
        if self.file.name.trim().is_empty() {
            dir_name(&self.dir)
        } else {
            self.file.name.clone()
        }
    }
}

fn read_instances(root: &Path) -> Vec<LithicRow> {
    let Ok(entries) = read_dir(root.join(INSTANCES_DIR)) else {
        return Vec::new();
    };
    let mut rows = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() || dir_name(&dir).starts_with('.') {
            continue;
        }
        let Ok(content) = read_to_string(dir.join(INSTANCE_FILE)) else {
            continue;
        };
        match toml::from_str::<LithicInstanceFile>(&content) {
            Ok(file) => rows.push(LithicRow { file, dir }),
            Err(error) => {
                log_error!(
                    "lithic: failed to parse {}: {error}",
                    dir.join(INSTANCE_FILE).display()
                );
            }
        }
    }
    rows.sort_by_key(|row| row.name().to_lowercase());
    rows
}

/// Copies the instance's data folder (and an external mods folder plus the
/// disabled mods) into the profile folder the importer stages, so a partial
/// copy never looks like a finished profile.
fn copy_instance(row: &LithicRow, profile_dir: &Path) -> Result<(), UiError> {
    let data_dir = row.data_dir();
    if data_dir.is_dir() {
        copy_dir_contents(&data_dir, profile_dir).map_err(|e| UiError::new("copy_failed", e))?;
    }

    // An extra mod folder outside the data directory (`--addModPath`)
    // would not be covered by the data copy.
    let mods_dir = row.mods_dir();
    if mods_dir.is_dir() && mods_dir != data_dir && !mods_dir.starts_with(&data_dir) {
        copy_dir_contents(&mods_dir, &profile_dir.join(MODS_DIR))
            .map_err(|e| UiError::new("copy_failed", e))?;
    }

    // Mods switched off in Lithic stay off, parked outside `Mods/`.
    let disabled_dir = row.disabled_mods_dir();
    if disabled_dir.is_dir() {
        copy_dir_contents(&disabled_dir, &profile_dir.join(PROFILE_DISABLED_DIR))
            .map_err(|e| UiError::new("copy_failed", e))?;
    }
    Ok(())
}

/// What Lithic contributes to the shared import driver.
struct LithicSource;

impl ImportSource for LithicSource {
    type Item = LithicRow;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "lithic"
    }

    fn found_noun(&self) -> &'static str {
        "instance(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let Some(root) = data_root() else {
            return Ok(None);
        };
        let instances = read_instances(&root);
        if instances.is_empty() {
            return Ok(Some(instances));
        }
        log_info!(
            "lithic: reading {} ({} instances)",
            root.display(),
            instances.len()
        );
        Ok(Some(instances))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("Lithic data folder not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in Lithic's instances folder"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "instance folder no longer exists"
    }

    fn describe(&self, row: &LithicRow, log: &MigrationLog) -> DetectedInstance {
        let path = row.dir.clone();
        let data_dir = row.data_dir();
        let mods_dir = row.mods_dir();
        let mut bytes = dir_size_cached(&data_dir);
        if mods_dir != data_dir && !mods_dir.starts_with(&data_dir) {
            bytes += dir_size_cached(&mods_dir);
        }
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: dir_name(&path),
            name: row.name(),
            version: row.file.game_version.clone().unwrap_or_default(),
            path: path.to_string_lossy().to_string(),
            source: "Lithic".into(),
            mod_count: count_mod_zips(&mods_dir),
            size_bytes,
            size_display,
            has_saves: has_saves(&data_dir),
            last_time_played: row
                .file
                .stats
                .last_played_at
                .filter(|value| *value > 0)
                .map(|value| value as u64),
            is_default_game_data: is_default_game_data(&data_dir),
            already_imported: is_already_imported(log, &path),
        }
    }

    fn source_path(&self, row: &LithicRow) -> PathBuf {
        row.dir.clone()
    }

    fn display_name(&self, row: &LithicRow) -> String {
        row.name()
    }

    fn target_folder(&self, row: &LithicRow) -> String {
        match safe_file_name(&row.name()) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => dir_name(&row.dir),
        }
    }

    fn placement(&self) -> Placement {
        Placement::Selective
    }

    fn stage(&self, _app: &AppHandle, row: &LithicRow, profile_dir: &Path) -> Result<(), UiError> {
        copy_instance(row, profile_dir)
    }

    fn staged_noun(&self) -> &'static str {
        "instance"
    }

    fn apply_profile(&self, row: &LithicRow, info: &mut ProfileInfo) {
        info.name = row.name();
        info.version = row.file.game_version.clone().unwrap_or_default();
        if !row.file.launch.args.is_empty() {
            info.start_params = shell_words::join(&row.file.launch.args);
        }
        info.env_vars = row
            .file
            .launch
            .env
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
        info.last_played = row
            .file
            .stats
            .last_played_at
            .filter(|value| *value > 0)
            .map(|value| (value / 1000) as u64);
        info.total_time_played = (row.file.stats.play_time_ms.max(0) / 1000) as u64;
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::AtEnd
    }
}

/// Lists Lithic instances that can be imported.
#[command]
pub async fn detect_lithic_instances(app: AppHandle) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &LithicSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Lithic scan failed: {e}")))?
}

/// Imports Lithic instances into the profiles folder (copy only).
#[command]
pub async fn import_lithic_instances(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, LithicSource, paths, None, None).await
}

/// Game builds registered by Lithic (`<data>/game/installs.toml`), ready to
/// be linked into Story Forge.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Some(root) = data_root() else {
        return Vec::new();
    };
    let path = root.join(GAME_DIR).join(INSTALLS_FILE);
    let Ok(content) = read_to_string(&path) else {
        return Vec::new();
    };
    let registry: LithicRegistry = match toml::from_str(&content) {
        Ok(registry) => registry,
        Err(error) => {
            log_error!("lithic: failed to parse {}: {error}", path.display());
            return Vec::new();
        }
    };

    let mut seen: HashSet<PathBuf> = HashSet::new();
    registry
        .installs
        .into_iter()
        .filter_map(|install| {
            let name = install.version.trim().to_string();
            let path = install.path;
            if name.is_empty()
                || !super::versions::looks_like_game_dir(&path)
                || !seen.insert(super::utils::normalize_path(&path))
            {
                return None;
            }
            Some(super::versions::DetectedVersion {
                name,
                path: path.to_string_lossy().to_string(),
                source: "Lithic".into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_instance_toml_with_external_folders() {
        let file: LithicInstanceFile = toml::from_str(
            r#"
            name = "Redwood"
            game_version = "1.21.5"
            data_dir = "/data/stock/VintagestoryData"
            mods_dir = "/data/shared/Mods"

            [launch]
            args = ["--tracelog", "-o"]
            env = { MESA_GLTHREAD = "true" }

            [stats]
            created_at = 1
            last_played_at = 1700000000000
            play_time_ms = 3600000
            "#,
        )
        .unwrap();
        assert_eq!(file.name, "Redwood");
        assert_eq!(file.game_version.as_deref(), Some("1.21.5"));
        assert_eq!(
            file.data_dir.as_deref(),
            Some(Path::new("/data/stock/VintagestoryData"))
        );
        assert_eq!(file.launch.args, vec!["--tracelog", "-o"]);
        assert_eq!(file.stats.play_time_ms / 1000, 3600);
    }

    #[test]
    fn resolves_default_and_external_dirs() {
        let instance_dir = PathBuf::from("/lithic/instances/redwood");
        let defaults = LithicRow {
            file: LithicInstanceFile::default(),
            dir: instance_dir.clone(),
        };
        assert_eq!(defaults.data_dir(), instance_dir.join("data"));
        assert_eq!(defaults.mods_dir(), instance_dir.join("data/Mods"));
        assert_eq!(
            defaults.disabled_mods_dir(),
            instance_dir.join("disabled-mods")
        );

        let external = LithicRow {
            file: LithicInstanceFile {
                data_dir: Some(PathBuf::from("/stock/VintagestoryData")),
                mods_dir: Some(PathBuf::from("relative/Mods")),
                ..Default::default()
            },
            dir: instance_dir.clone(),
        };
        assert_eq!(
            external.data_dir(),
            PathBuf::from("/stock/VintagestoryData")
        );
        assert_eq!(external.mods_dir(), instance_dir.join("relative/Mods"));
    }

    #[test]
    fn parses_the_game_registry() {
        let registry: LithicRegistry = toml::from_str(
            r#"
            [[installs]]
            version = "1.21.5"
            path = "/lithic/game/1.21.5"
            managed = true

            [[installs]]
            version = "1.20.9"
            path = "/opt/vs/1.20.9"
            "#,
        )
        .unwrap();
        assert_eq!(registry.installs.len(), 2);
        assert_eq!(registry.installs[0].version, "1.21.5");
        assert_eq!(registry.installs[1].path, PathBuf::from("/opt/vs/1.20.9"));
    }

    #[test]
    fn reads_instances_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("lithic");
        let instance = root.join("instances/redwood");
        std::fs::create_dir_all(instance.join("data/Mods")).unwrap();
        std::fs::create_dir_all(instance.join("data/Saves")).unwrap();
        std::fs::create_dir_all(instance.join("disabled-mods")).unwrap();
        std::fs::write(
            instance.join(INSTANCE_FILE),
            "name = \"Redwood\"\ngame_version = \"1.21.5\"\n",
        )
        .unwrap();
        std::fs::write(instance.join("data/Mods/a.zip"), b"zip").unwrap();
        std::fs::write(instance.join("disabled-mods/b.zip"), b"zip").unwrap();

        let rows = read_instances(&root);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name(), "Redwood");
        assert_eq!(count_mod_zips(&rows[0].mods_dir()), 1);
        assert!(rows[0].disabled_mods_dir().is_dir());
    }
}
