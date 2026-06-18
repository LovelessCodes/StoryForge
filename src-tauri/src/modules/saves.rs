use prost::Message;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    fs::{create_dir_all, read_dir, remove_file, rename, Metadata},
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::installations::find_installation_by_id;
use super::proto::{GameData, MapMarkers, ProspectingLog};
use super::utils::{installations_folder, installations_subdir};
use crate::{log_error, log_info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct World {
    pub data: GameData,
    pub has_map: bool,
    pub path: String,
    pub installation_name: String,
    pub map_markers: Option<Option<MapMarkers>>,
    pub prospecting_logs: Vec<(String, ProspectingLog)>,
}

// ── SQLite helpers for .vcdbs files ──

fn open_vcdbs(path: &Path, writable: bool) -> Result<Connection, UiError> {
    if writable {
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE).map_err(|e| {
            log_error!("saves: DB open error: {e}");
            UiError::from(format!("DB open error: {e}"))
        })
    } else {
        let uri = format!("file:{}?immutable=1", path.to_string_lossy());
        Connection::open_with_flags(
            &uri,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|e| {
            log_error!("saves: DB open error: {e}");
            UiError::from(format!("DB open error: {e}"))
        })
    }
}

fn read_gamedata(conn: &Connection) -> Result<GameData, UiError> {
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| {
            log_error!("saves: DB prepare error: {e}");
            UiError::from(format!("DB prepare error: {e}"))
        })?;

    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("saves: DB query error: {e}");
        UiError::from(format!("DB query error: {e}"))
    })?;

    let Some(row) = rows.next().map_err(|e| {
        log_error!("saves: DB row error: {e}");
        UiError::from(format!("DB row error: {e}"))
    })?
    else {
        return Err(UiError::from("No gamedata found"));
    };

    let data: Vec<u8> = row.get(0).map_err(|e| {
        log_error!("saves: DB get error: {e}");
        UiError::from(format!("DB get error: {e}"))
    })?;

    GameData::decode(data.as_slice()).map_err(|e| {
        log_error!("saves: Protobuf decode error: {e}");
        UiError::from(format!("Protobuf decode error: {e}"))
    })
}

fn write_gamedata(conn: &Connection, gamedata: &GameData) -> Result<(), UiError> {
    let mut buf = Vec::new();
    gamedata.encode(&mut buf).map_err(|e| {
        log_error!("saves: Protobuf encode error: {e}");
        UiError::from(format!("Protobuf encode error: {e}"))
    })?;

    conn.execute("UPDATE gamedata SET data = ?1", [&buf])
        .map_err(|e| {
            log_error!("saves: DB update error: {e}");
            UiError::from(format!("DB update error: {e}"))
        })?;

    Ok(())
}

// ── Protobuf / gamedata helpers ──

fn compress_gamedata(gamedata: &GameData) -> GameData {
    GameData {
        world_name: gamedata.world_name.clone(),
        savegame_identifier: gamedata.savegame_identifier.clone(),
        seed: gamedata.seed,
        created_by_player_name: gamedata.created_by_player_name.clone(),
        created_game_version: gamedata.created_game_version.clone(),
        last_saved_game_version: gamedata.last_saved_game_version.clone(),
        last_played: gamedata.last_played.clone(),
        total_game_seconds: gamedata.total_game_seconds,
        total_game_seconds_start: gamedata.total_game_seconds_start,
        total_seconds_played: gamedata.total_seconds_played,
        world_type: gamedata.world_type.clone(),
        play_style: gamedata.play_style.clone(),
        ..Default::default()
    }
}

fn extract_map_markers(gamedata: &GameData) -> Option<Option<MapMarkers>> {
    gamedata
        .mod_data
        .get("playerMapMarkers_v2")
        .map(|data| MapMarkers::decode(data.as_slice()).ok())
}

fn extract_prospecting_logs(gamedata: &GameData) -> Result<Vec<(String, ProspectingLog)>, UiError> {
    let mut results = Vec::new();
    for (key, value) in &gamedata.mod_data {
        if let Some(player_uid) = key.strip_prefix("oreMapMarkers-") {
            let items = ProspectingLog::decode(value.as_slice())
                .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?;
            results.push((player_uid.to_string(), items));
        }
    }
    Ok(results)
}

fn has_map(installation_path: &Path, savegame_identifier: &str) -> bool {
    installation_path
        .join("Maps")
        .join(format!("{}.db", savegame_identifier))
        .exists()
}

fn load_world_from_vcdbs(
    installation_path: &Path,
    save_path: &Path,
    installation_name: String,
) -> Result<World, UiError> {
    let conn = open_vcdbs(save_path, false)?;
    let gamedata = read_gamedata(&conn)?;

    let compressed = compress_gamedata(&gamedata);
    let has_map = has_map(installation_path, &gamedata.savegame_identifier);
    let map_markers = extract_map_markers(&gamedata);
    let prospecting_logs = extract_prospecting_logs(&gamedata)?;

    Ok(World {
        data: compressed,
        has_map,
        path: save_path.to_string_lossy().to_string(),
        installation_name,
        map_markers,
        prospecting_logs,
    })
}

// ── Saves cache ──
// `scan_saves` is the heaviest scan path because it opens every .vcdbs file
// and decodes protobuf gamedata. Cache the result keyed by a fingerprint of
// the file metadata, and invalidate on any write operation.

struct SavesCache {
    entries: std::collections::HashMap<PathBuf, SavesCacheEntry>,
}

struct SavesCacheEntry {
    fingerprint: u64,
    worlds: Vec<World>,
}

static SAVES_CACHE: OnceLock<Mutex<SavesCache>> = OnceLock::new();

fn saves_cache() -> &'static Mutex<SavesCache> {
    SAVES_CACHE.get_or_init(|| {
        Mutex::new(SavesCache {
            entries: std::collections::HashMap::new(),
        })
    })
}

fn hash_path_metadata(
    hasher: &mut std::collections::hash_map::DefaultHasher,
    path: &Path,
    meta: &Metadata,
) {
    path.hash(hasher);
    if let Ok(modified) = meta.modified() {
        if let Ok(d) = modified.duration_since(UNIX_EPOCH) {
            d.as_secs().hash(hasher);
            d.subsec_nanos().hash(hasher);
        }
    }
    meta.len().hash(hasher);
}

fn saves_fingerprint(installations_dir: &Path) -> Result<u64, UiError> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    installations_dir.hash(&mut hasher);

    for entry in read_dir(installations_dir).map_err(|e| {
        log_error!("saves: Read dir error: {e}");
        UiError::from(format!("Read dir error: {e}"))
    })? {
        let entry = entry.map_err(|e| {
            log_error!("saves: Dir entry error: {e}");
            UiError::from(format!("Dir entry error: {e}"))
        })?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let saves_path = path.join("Saves");
        if !saves_path.is_dir() {
            continue;
        }

        for save_entry in read_dir(&saves_path).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::from(format!("Read dir error: {e}"))
        })? {
            let save_entry = save_entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::from(format!("Dir entry error: {e}"))
            })?;
            let save_path = save_entry.path();
            if !save_path.is_file() {
                continue;
            }
            if save_path.extension() != Some(OsStr::new("vcdbs")) {
                continue;
            }
            if let Ok(meta) = save_entry.metadata() {
                hash_path_metadata(&mut hasher, &save_path, &meta);
            }
        }
    }

    Ok(hasher.finish())
}

fn try_cached_saves(installations_dir: &Path) -> Option<Vec<World>> {
    let fingerprint = saves_fingerprint(installations_dir).ok()?;
    let cache = saves_cache().lock().ok()?;
    let entry = cache.entries.get(installations_dir)?;
    if entry.fingerprint == fingerprint {
        return Some(entry.worlds.clone());
    }
    None
}

fn store_saves_cache(installations_dir: &Path, worlds: &[World]) {
    if let Ok(fingerprint) = saves_fingerprint(installations_dir) {
        if let Ok(mut cache) = saves_cache().lock() {
            cache.entries.insert(
                installations_dir.to_path_buf(),
                SavesCacheEntry {
                    fingerprint,
                    worlds: worlds.to_vec(),
                },
            );
        }
    }
}

fn invalidate_saves_cache() {
    if let Ok(mut cache) = saves_cache().lock() {
        cache.entries.clear();
        log_info!("saves: invalidated save cache");
    }
}

// ── Commands ──

/// Scan `installations_dir` for all `.vcdbs` save files.
pub fn scan_saves(installations_dir: &Path) -> Result<Vec<World>, UiError> {
    if !installations_dir.exists() || !installations_dir.is_dir() {
        return Ok(Vec::new());
    }

    if let Some(cached) = try_cached_saves(installations_dir) {
        log_info!("saves: returning cached save list");
        return Ok(cached);
    }

    let mut saves: Vec<World> = Vec::new();

    for entry in read_dir(installations_dir).map_err(|e| {
        log_error!("saves: Read dir error: {e}");
        UiError::from(format!("Read dir error: {e}"))
    })? {
        let entry = entry.map_err(|e| {
            log_error!("saves: Dir entry error: {e}");
            UiError::from(format!("Dir entry error: {e}"))
        })?;
        let path = entry.path();
        let installation_name = entry.file_name().into_string().unwrap_or_default();

        if !path.is_dir() {
            continue;
        }

        let saves_path = path.join("Saves");
        if !saves_path.exists() || !saves_path.is_dir() {
            continue;
        }

        for save_entry in read_dir(saves_path).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::from(format!("Read dir error: {e}"))
        })? {
            let save_entry = save_entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::from(format!("Dir entry error: {e}"))
            })?;
            let save_path = save_entry.path();
            if !save_path.is_file() {
                continue;
            }
            if save_path.extension() != Some(OsStr::new("vcdbs")) {
                continue;
            }

            let world = load_world_from_vcdbs(&path, &save_path, installation_name.clone())?;
            saves.push(world);
        }
    }

    store_saves_cache(installations_dir, &saves);
    Ok(saves)
}

#[command]
pub fn get_all_saves(app: AppHandle) -> Result<Vec<World>, UiError> {
    log_info!("get_all_saves");
    let start = std::time::Instant::now();

    let subdir = installations_subdir(app.clone());
    let installation_dir_path = installations_folder(app.clone()).join(&subdir);
    let result = scan_saves(&installation_dir_path);

    log_info!(
        "get_all_saves completed in {}ms",
        start.elapsed().as_millis()
    );
    result
}

#[command]
pub fn get_installation_saves(
    app: AppHandle,
    installation_id: u64,
) -> Result<Vec<String>, UiError> {
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let saves_path = pb.join("Saves");

    let mut saves = Vec::new();
    if saves_path.exists() && saves_path.is_dir() {
        for entry in read_dir(saves_path).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::from(format!("Read dir error: {e}"))
        })? {
            let entry = entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::from(format!("Dir entry error: {e}"))
            })?;
            let path = entry.path();
            if path.is_file() && path.extension() == Some(OsStr::new("vcdbs")) {
                if let Some(save_name) = path.file_stem().and_then(|s| s.to_str()) {
                    saves.push(save_name.to_string());
                }
            }
        }
    }

    Ok(saves)
}

#[command]
pub fn update_world(
    app: AppHandle,
    installation_id: u64,
    world_path: String,
    name: String,
    identifier: Option<String>,
) -> Result<(), UiError> {
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let saves_path = pb.join("Saves");
    if !saves_path.exists() {
        create_dir_all(&saves_path).map_err(|e| {
            log_error!("saves: Create dir error: {e}");
            UiError::from(format!("Create dir error: {e}"))
        })?;
    }
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }

    if world_path.extension() != Some(OsStr::new("vcdbs")) {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!("World file {} is not a .vcdbs file", world_path.display()),
        });
    }

    // Rename the file to the new name, sanitized and lowercased
    let file_name = name
        .replace(
            |c: char| !c.is_ascii_alphanumeric() && c != ' ' && c != '_' && c != '-',
            "",
        )
        .to_lowercase();
    let new_world_path = saves_path.join(format!("{}.vcdbs", file_name));

    // If an identifier is provided, and a Maps file is found with that identifier, move it too
    if let Some(id) = identifier {
        let maps_path = world_path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Maps").join(format!("{}.db", id)));
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                let new_maps_path = pb.join("Maps").join(format!("{}.db", id));
                let maps_dir = new_maps_path.parent().unwrap();
                if !maps_dir.exists() {
                    create_dir_all(maps_dir).map_err(|e| {
                        log_error!("saves: Create dir error: {e}");
                        UiError::from(format!("Create dir error: {e}"))
                    })?;
                }
                rename(maps_path, &new_maps_path).map_err(|e| {
                    log_error!("saves: Rename error: {e}");
                    UiError::from(format!("Rename error: {e}"))
                })?;
            }
        }
    }

    rename(world_path, &new_world_path).map_err(|e| {
        log_error!("saves: Rename error: {e}");
        UiError::from(format!("Rename error: {e}"))
    })?;
    invalidate_saves_cache();

    // Update the "WorldName" field in the protobuf data inside the .vcdbs file
    let conn = open_vcdbs(&new_world_path, true)?;
    let mut gamedata = read_gamedata(&conn)?;
    gamedata.world_name = name;
    write_gamedata(&conn, &gamedata)?;

    Ok(())
}

#[command]
pub fn remove_world(world_path: String) -> Result<(), UiError> {
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }
    if world_path.extension() != Some(OsStr::new("vcdbs")) {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!("World file {} is not a .vcdbs file", world_path.display()),
        });
    }

    let conn = open_vcdbs(world_path, false)?;
    let gamedata = read_gamedata(&conn)?;

    let maps_path = world_path.parent().and_then(|p| p.parent()).map(|p| {
        p.join("Maps")
            .join(format!("{}.db", gamedata.savegame_identifier))
    });
    if let Some(maps_path) = maps_path {
        if maps_path.exists() && maps_path.is_file() {
            remove_file(maps_path).map_err(|e| {
                log_error!("saves: Remove file error: {e}");
                UiError::from(format!("Remove file error: {e}"))
            })?;
        }
    }

    remove_file(world_path).map_err(|e| {
        log_error!("saves: Remove file error: {e}");
        UiError::from(format!("Remove file error: {e}"))
    })?;
    invalidate_saves_cache();
    Ok(())
}
