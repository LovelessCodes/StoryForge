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
    fs::{read_dir, read_to_string},
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
use super::utils::{copy_dir_contents, dir_size_cached, home_dir, safe_file_name};
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

#[derive(Debug, Clone)]
struct CairnPackRow {
    id: String,
    name: String,
    version: String,
    dir: PathBuf,
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

/// Copies `data/` (the pack's game data) and `Mods/` (its mods) into the
/// profile folder the importer stages, so a partial copy never looks like a
/// finished profile.
fn copy_pack(pack_dir: &Path, profile_dir: &Path) -> Result<(), UiError> {
    let data_dir = pack_dir.join(DATA_DIR);
    if data_dir.is_dir() {
        copy_dir_contents(&data_dir, profile_dir).map_err(|e| UiError::new("copy_failed", e))?;
    }

    let mods_dir = pack_dir.join(MODS_DIR);
    if mods_dir.is_dir() {
        copy_dir_contents(&mods_dir, &profile_dir.join(MODS_DIR))
            .map_err(|e| UiError::new("copy_failed", e))?;
    }
    Ok(())
}

/// What Cairn contributes to the shared import driver.
struct CairnSource;

impl ImportSource for CairnSource {
    type Item = CairnPackRow;

    fn log_file(&self) -> &'static str {
        MIGRATION_LOG_FILE
    }

    fn label(&self) -> &'static str {
        "cairn"
    }

    fn found_noun(&self) -> &'static str {
        "pack(s)"
    }

    fn scan(&self, _app: &AppHandle) -> Result<Option<Vec<Self::Item>>, UiError> {
        let Some(root) = cairn_root() else {
            return Ok(None);
        };
        let packs = read_packs(&root);
        if packs.is_empty() {
            return Ok(Some(packs));
        }
        log_info!("cairn: reading {} ({} packs)", root.display(), packs.len());
        Ok(Some(packs))
    }

    fn missing_source_error(&self) -> UiError {
        UiError::not_found("Cairn data folder not found")
    }

    fn not_listed_reason(&self) -> &'static str {
        "not listed in Cairn's packs folder"
    }

    fn missing_folder_reason(&self) -> &'static str {
        "pack folder no longer exists"
    }

    fn describe(&self, pack: &CairnPackRow, log: &MigrationLog) -> DetectedInstance {
        let path = pack.dir.clone();
        let data_dir = path.join(DATA_DIR);
        let mods_dir = path.join(MODS_DIR);
        let bytes = dir_size_cached(&data_dir) + dir_size_cached(&mods_dir);
        let (size_bytes, size_display) = size_fields(bytes);
        DetectedInstance {
            id: pack.id.clone(),
            name: pack.name.clone(),
            version: pack.version.clone(),
            path: path.to_string_lossy().to_string(),
            source: "Cairn".into(),
            mod_count: count_mod_zips(&mods_dir),
            size_bytes,
            size_display,
            has_saves: has_saves(&data_dir),
            last_time_played: None,
            is_default_game_data: false,
            already_imported: is_already_imported(log, &path),
        }
    }

    fn source_path(&self, pack: &CairnPackRow) -> PathBuf {
        pack.dir.clone()
    }

    fn display_name(&self, pack: &CairnPackRow) -> String {
        pack.name.clone()
    }

    fn target_folder(&self, pack: &CairnPackRow) -> String {
        match safe_file_name(&pack.name) {
            Ok(folder) if !folder.is_empty() => folder,
            _ => pack.id.clone(),
        }
    }

    fn placement(&self) -> Placement {
        Placement::Selective
    }

    fn stage(
        &self,
        _app: &AppHandle,
        pack: &CairnPackRow,
        profile_dir: &Path,
    ) -> Result<(), UiError> {
        copy_pack(&pack.dir, profile_dir)
    }

    fn staged_noun(&self) -> &'static str {
        "pack"
    }

    fn apply_profile(&self, pack: &CairnPackRow, info: &mut ProfileInfo) {
        info.name = pack.name.clone();
        info.version = pack.version.clone();
    }

    fn log_write(&self) -> LogWrite {
        LogWrite::AtEnd
    }
}

/// Lists Cairn packs that can be imported.
#[command]
pub async fn detect_cairn_packs(app: AppHandle) -> Result<Vec<DetectedInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_all(&handle, &CairnSource))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Cairn scan failed: {e}")))?
}

/// Imports Cairn packs into the profiles folder (copy only).
#[command]
pub async fn import_cairn_packs(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<ImportReport, UiError> {
    run_import(app, CairnSource, paths, None, None).await
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
        copy_pack(&pack, &target).unwrap();
        assert!(target.join("Saves/world.vcdbs").is_file());
        assert!(target.join("Mods/a.zip").is_file());
        assert!(!target.join(MANIFEST_FILE).exists());
        assert!(!target.join(DATA_DIR).exists());
    }
}
