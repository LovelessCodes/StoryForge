//! Import of Cairn (cairns-gg) packs as Story Forge profiles.
//!
//! Cairn keeps its state under a movable root (`CAIRN_HOME`, else a `home`
//! pointer file inside the default root, else `~/.cairn`) and treats **a pack
//! as the instance**: the pack's game data path is `<root>/packs/<id>/data`,
//! while its mods sit next to it in `<root>/packs/<id>/Mods` and reach the
//! game through `--addModPath`. `pack.json` carries the name and game version:
//!
//! ```json
//! { "id": "anego", "name": "Anego Server", "gameVersion": "1.22.5", "mods": […] }
//! ```
//!
//! Importing a pack therefore copies two directories into one profile folder
//! (`data/` into the profile root, `Mods/` into the profile's `Mods/`). It is
//! deliberately copy-only: the pack folder also holds Cairn's own manifest,
//! lock and local-state files, so there is nothing to move without breaking
//! Cairn. Game builds Cairn installed itself live under `<root>/games/<version>`
//! and can be linked in place.

use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, rename, write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip};
use super::paths::{MODS_DIR, PROFILE_JSON};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    copy_dir_contents, dir_size_cached, format_size, home_dir, normalize_path, now_nanos,
    profiles_folder, profiles_subdir, safe_file_name,
};
use crate::log_info;

const CAIRN_DIR: &str = ".cairn";
/// Pointer file naming a moved root; lives inside the default root.
const POINTER_FILE: &str = "home";
const PACKS_DIR: &str = "packs";
const GAMES_DIR: &str = "games";
/// Where a pack's game data lives inside its folder.
const DATA_DIR: &str = "data";
const MANIFEST_FILE: &str = "pack.json";
const MIGRATION_LOG_FILE: &str = "cairn-migration.json";

#[derive(Debug, Clone, Serialize)]
pub struct CairnPack {
    pub id: String,
    pub name: String,
    pub version: String,
    /// The pack folder (import copies `data/` and `Mods/` out of it).
    pub path: String,
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// Always false for Cairn (pack data paths are never the stock data folder).
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CairnMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CairnMigrationLog {
    #[serde(default)]
    migrations: Vec<CairnMigrationEntry>,
}

fn default_root() -> Option<PathBuf> {
    home_dir().map(|home| home.join(CAIRN_DIR))
}

/// CAIRN_HOME, then the `home` pointer inside the default root, then the
/// default root itself (matching Cairn's own precedence).
fn resolve_root(env_home: Option<PathBuf>, default: PathBuf) -> PathBuf {
    if let Some(root) = env_home.filter(|path| !path.as_os_str().is_empty()) {
        return root;
    }
    if let Ok(value) = read_to_string(default.join(POINTER_FILE)) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return path;
            }
        }
    }
    default
}

fn cairn_root() -> Option<PathBuf> {
    let default = std::env::var_os("CAIRN_DEFAULT_HOME")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .or_else(default_root)?;
    Some(resolve_root(
        std::env::var_os("CAIRN_HOME").map(PathBuf::from),
        default,
    ))
}

fn pack_name(manifest: Option<&Value>, folder: &str) -> String {
    manifest
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(folder)
        .to_string()
}

fn pack_version(manifest: Option<&Value>) -> String {
    manifest
        .and_then(|value| value.get("gameVersion"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
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

struct CairnPackRow {
    id: String,
    name: String,
    version: String,
    dir: PathBuf,
}

/// Every pack Cairn knows about, whether or not it has been launched yet.
fn read_packs(root: &Path) -> Vec<CairnPackRow> {
    let packs_root = root.join(PACKS_DIR);
    let Ok(entries) = read_dir(&packs_root) else {
        return Vec::new();
    };
    let mut packs = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if folder.starts_with('.') {
            continue;
        }
        let manifest = read_to_string(dir.join(MANIFEST_FILE))
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok());
        let id = manifest
            .as_ref()
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(&folder)
            .to_string();
        packs.push(CairnPackRow {
            id,
            name: pack_name(manifest.as_ref(), &folder),
            version: pack_version(manifest.as_ref()),
            dir,
        });
    }
    packs.sort_by_key(|pack| pack.name.to_lowercase());
    packs
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

fn read_migration_log(app: &AppHandle) -> CairnMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &CairnMigrationLog) -> Result<(), UiError> {
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

/// Lists Cairn packs that can be imported.
#[command]
pub async fn detect_cairn_packs(app: AppHandle) -> Result<Vec<CairnPack>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Cairn scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<CairnPack>, UiError> {
    let Some(root) = cairn_root() else {
        return Ok(Vec::new());
    };
    let packs = read_packs(&root);
    if packs.is_empty() {
        return Ok(Vec::new());
    }
    log_info!("cairn: reading {} ({} packs)", root.display(), packs.len());

    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let mut results = Vec::new();

    for pack in packs {
        let path = pack.dir.clone();
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }

        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });

        let data_dir = path.join(DATA_DIR);
        let mods_dir = path.join(MODS_DIR);
        let size_bytes = dir_size_cached(&data_dir) + dir_size_cached(&mods_dir);
        results.push(CairnPack {
            id: pack.id,
            name: pack.name,
            version: pack.version,
            path: path.to_string_lossy().to_string(),
            source: "Cairn".into(),
            mod_count: count_zips(&mods_dir),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: data_dir.join("Saves").is_dir(),
            last_time_played: None,
            is_default_game_data: false,
            already_imported,
        });
    }

    log_info!("cairn: found {} pack(s)", results.len());
    Ok(results)
}

/// Imports Cairn packs into the profiles folder (copy only).
#[command]
pub async fn import_cairn_packs(
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
    let Some(root) = cairn_root() else {
        return Err(UiError::not_found("Cairn data folder not found"));
    };
    let packs = read_packs(&root);

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
        let Some(pack) = packs
            .iter()
            .find(|pack| normalize_path(&pack.dir) == requested_normalized)
        else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in Cairn's packs folder".into(),
            });
            continue;
        };

        let source = pack.dir.clone();
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: pack.name.clone(),
                reason: "pack folder no longer exists".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name: pack.name.clone(),
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name: pack.name.clone(),
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let folder = match safe_file_name(&pack.name) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => pack.id.clone(),
        };
        let target = free_profile_dir(&profiles_root, &folder);
        if let Err(reason) = copy_pack(&profiles_root, &source, &target) {
            report.skipped.push(LegacyMigrationSkip {
                name: pack.name.clone(),
                reason,
            });
            continue;
        }

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: pack.name.clone(),
            ..Default::default()
        });
        info.name = pack.name.clone();
        info.version = pack.version.clone();

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: pack.name.clone(),
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("cairn: imported {} (copy)", info.name);
        log.migrations.push(CairnMigrationEntry {
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

/// Copies `data/` (the pack's game data) and `Mods/` (its mods) into a fresh
/// profile folder, staging inside the profiles root so a partial copy never
/// looks like a finished profile.
fn copy_pack(profiles_root: &Path, pack_dir: &Path, target: &Path) -> Result<(), String> {
    let staging = profiles_root.join(format!(".staging-{}", now_nanos()));
    create_dir_all(&staging).map_err(|e| format!("failed to create staging folder: {e}"))?;

    let result = (|| -> Result<(), String> {
        let staged_profile = staging.join("profile");
        create_dir_all(&staged_profile)
            .map_err(|e| format!("failed to create the profile folder: {e}"))?;

        let data_dir = pack_dir.join(DATA_DIR);
        if data_dir.is_dir() {
            copy_dir_contents(&data_dir, &staged_profile)?;
        }

        let mods_dir = pack_dir.join(MODS_DIR);
        if mods_dir.is_dir() {
            copy_dir_contents(&mods_dir, &staged_profile.join(MODS_DIR))?;
        }

        rename(&staged_profile, target)
            .map_err(|e| format!("failed to move the copied pack into place: {e}"))
    })();

    let _ = remove_dir_all(&staging);
    result
}

/// Game versions installed by Cairn (`<root>/games/<version>`), ready to be
/// linked into Story Forge.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Some(root) = cairn_root() else {
        return Vec::new();
    };
    let Ok(entries) = read_dir(root.join(GAMES_DIR)) else {
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
                source: "Cairn".into(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_the_root_like_cairn_does() {
        let dir = tempfile::tempdir().unwrap();
        let default = dir.path().join("default");

        // Nothing set: the default root.
        assert_eq!(resolve_root(None, default.clone()), default);

        // The pointer file wins over the default.
        std::fs::create_dir_all(&default).unwrap();
        let moved = dir.path().join("moved");
        std::fs::create_dir_all(&moved).unwrap();
        std::fs::write(
            default.join(POINTER_FILE),
            moved.to_string_lossy().as_bytes(),
        )
        .unwrap();
        assert_eq!(resolve_root(None, default.clone()), moved);

        // CAIRN_HOME outranks the pointer.
        let env_home = dir.path().join("env");
        assert_eq!(
            resolve_root(Some(env_home.clone()), default.clone()),
            env_home
        );

        // An empty environment value falls through to the pointer.
        assert_eq!(resolve_root(Some(PathBuf::new()), default.clone()), moved);

        // A stale pointer falls back to the default root.
        std::fs::write(default.join(POINTER_FILE), "/does/not/exist").unwrap();
        assert_eq!(resolve_root(None, default.clone()), default);
    }

    #[test]
    fn reads_pack_manifests_with_fallbacks() {
        let named =
            serde_json::json!({ "id": "anego", "name": "Anego Server", "gameVersion": "1.22.5" });
        assert_eq!(pack_name(Some(&named), "folder"), "Anego Server");
        assert_eq!(pack_version(Some(&named)), "1.22.5");

        let unnamed = serde_json::json!({ "id": "untitled" });
        assert_eq!(pack_name(Some(&unnamed), "folder"), "folder");
        assert_eq!(pack_version(Some(&unnamed)), "");
        assert_eq!(pack_name(None, "folder"), "folder");
    }

    #[test]
    fn reads_packs_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("cairn");
        let pack = root.join("packs/anego");
        std::fs::create_dir_all(pack.join("data/Saves")).unwrap();
        std::fs::create_dir_all(pack.join("Mods")).unwrap();
        std::fs::write(
            pack.join(MANIFEST_FILE),
            r#"{"id":"anego","name":"Anego Server","gameVersion":"1.22.5"}"#,
        )
        .unwrap();
        std::fs::write(pack.join("Mods/a.zip"), b"zip").unwrap();
        std::fs::write(pack.join("data/Saves/world.vcdbs"), b"db").unwrap();

        let packs = read_packs(&root);
        assert_eq!(packs.len(), 1);
        assert_eq!(packs[0].id, "anego");
        assert_eq!(packs[0].name, "Anego Server");
        assert_eq!(packs[0].version, "1.22.5");

        // Import copies data/ into the profile root and Mods/ into Mods/.
        let profiles = dir.path().join("profiles");
        std::fs::create_dir_all(&profiles).unwrap();
        let target = profiles.join("Anego_Server");
        copy_pack(&profiles, &pack, &target).unwrap();
        assert!(target.join("Saves/world.vcdbs").is_file());
        assert!(target.join("Mods/a.zip").is_file());
        assert!(!target.join(MANIFEST_FILE).exists());
        assert!(!target.join(DATA_DIR).exists());
    }
}
