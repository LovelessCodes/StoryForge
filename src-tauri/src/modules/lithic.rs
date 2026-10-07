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
    copy_dir_contents, dir_name, dir_size_cached, format_size, normalize_path, now_nanos,
    profiles_folder, profiles_subdir, safe_file_name,
};
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

#[derive(Debug, Default, Deserialize)]
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

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct LithicLaunch {
    args: Vec<String>,
    env: BTreeMap<String, String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct LithicStats {
    last_played_at: Option<i64>,
    play_time_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LithicInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    /// The instance folder (import copies its data folder).
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// The instance plays the game's own default data folder (a copy leaves
    /// the stock launcher's data untouched).
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LithicMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LithicMigrationLog {
    #[serde(default)]
    migrations: Vec<LithicMigrationEntry>,
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

fn read_migration_log(app: &AppHandle) -> LithicMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &LithicMigrationLog) -> Result<(), UiError> {
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

/// Lists Lithic instances that can be imported.
#[command]
pub async fn detect_lithic_instances(app: AppHandle) -> Result<Vec<LithicInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Lithic scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<LithicInstance>, UiError> {
    let Some(root) = data_root() else {
        return Ok(Vec::new());
    };
    let instances = read_instances(&root);
    if instances.is_empty() {
        return Ok(Vec::new());
    }
    log_info!(
        "lithic: reading {} ({} instances)",
        root.display(),
        instances.len()
    );

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let game_data_candidates = super::game_data::default_data_candidates();
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

        let data_dir = row.data_dir();
        let mods_dir = row.mods_dir();
        let mut size_bytes = dir_size_cached(&data_dir);
        if mods_dir != data_dir && !mods_dir.starts_with(&data_dir) {
            size_bytes += dir_size_cached(&mods_dir);
        }
        let is_default_game_data = game_data_candidates
            .iter()
            .any(|candidate| normalize_path(candidate) == normalize_path(&data_dir));

        results.push(LithicInstance {
            id: dir_name(&path),
            name: row.name(),
            version: row.file.game_version.clone().unwrap_or_default(),
            path: path.to_string_lossy().to_string(),
            source: "Lithic".into(),
            mod_count: count_zips(&mods_dir),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: data_dir.join(SAVES_DIR).is_dir(),
            last_time_played: row
                .file
                .stats
                .last_played_at
                .filter(|value| *value > 0)
                .map(|value| value as u64),
            is_default_game_data,
            already_imported,
        });
    }

    log_info!("lithic: found {} instance(s)", results.len());
    Ok(results)
}

/// Imports Lithic instances into the profiles folder (copy only).
#[command]
pub async fn import_lithic_instances(
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
    let Some(root) = data_root() else {
        return Err(UiError::not_found("Lithic data folder not found"));
    };
    let instances = read_instances(&root);

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
                reason: "not listed in Lithic's instances folder".into(),
            });
            continue;
        };

        let source = row.dir.clone();
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: row.name(),
                reason: "instance folder no longer exists".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.name(),
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.name(),
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let folder = match safe_file_name(&row.name()) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => dir_name(&source),
        };
        let target = free_profile_dir(&profiles_root, &folder);
        if let Err(reason) = copy_instance(&profiles_root, row, &target) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.name(),
                reason,
            });
            continue;
        }

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: row.name(),
            ..Default::default()
        });
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

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: row.name(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("lithic: imported {} (copy)", info.name);
        log.migrations.push(LithicMigrationEntry {
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

/// Copies the instance's data folder (and an external mods folder plus the
/// disabled mods) into a fresh profile, staging inside the profiles root so a
/// partial copy never looks like a finished profile.
fn copy_instance(profiles_root: &Path, row: &LithicRow, target: &Path) -> Result<(), String> {
    let staging = profiles_root.join(format!(".staging-{}", now_nanos()));
    create_dir_all(&staging).map_err(|e| format!("failed to create staging folder: {e}"))?;

    let result = (|| -> Result<(), String> {
        let staged_profile = staging.join("profile");
        create_dir_all(&staged_profile)
            .map_err(|e| format!("failed to create the profile folder: {e}"))?;

        let data_dir = row.data_dir();
        if data_dir.is_dir() {
            copy_dir_contents(&data_dir, &staged_profile)?;
        }

        // An extra mod folder outside the data directory (`--addModPath`)
        // would not be covered by the data copy.
        let mods_dir = row.mods_dir();
        if mods_dir.is_dir() && mods_dir != data_dir && !mods_dir.starts_with(&data_dir) {
            copy_dir_contents(&mods_dir, &staged_profile.join(MODS_DIR))?;
        }

        // Mods switched off in Lithic stay off, parked outside `Mods/`.
        let disabled_dir = row.disabled_mods_dir();
        if disabled_dir.is_dir() {
            copy_dir_contents(&disabled_dir, &staged_profile.join(PROFILE_DISABLED_DIR))?;
        }

        rename(&staged_profile, target)
            .map_err(|e| format!("failed to move the copied instance into place: {e}"))
    })();

    let _ = remove_dir_all(&staging);
    result
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
                || !seen.insert(normalize_path(&path))
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
        assert_eq!(count_zips(&rows[0].mods_dir()), 1);
        assert!(rows[0].disabled_mods_dir().is_dir());
    }
}
