use prost::Message;
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsStr,
    fs::{copy, create_dir_all, read_dir, remove_file, rename, File, Metadata},
    hash::{Hash, Hasher},
    io,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tauri::{command, AppHandle};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::errors::UiError;
use super::paths;
use super::profiles::find_profile_by_id;
use super::proto::{GameData, MapMarkers, ProspectingLog};
use super::utils::{dir_name, lock, profiles_folder, profiles_subdir, require_managed_path};
use super::vcdbs;
use crate::{log_error, log_info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct World {
    pub data: GameData,
    pub has_map: bool,
    pub path: String,
    pub profile_name: String,
    pub map_markers: Option<Option<MapMarkers>>,
    pub prospecting_logs: Vec<(String, ProspectingLog)>,
}

// ── SQLite helpers for .vcdbs files ──

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
                .map_err(|e| UiError::new("decode_error", format!("Protobuf decode error: {e}")))?;
            results.push((player_uid.to_string(), items));
        }
    }
    Ok(results)
}

fn has_map(profile_path: &Path, savegame_identifier: &str) -> bool {
    profile_path
        .join(paths::MAPS_DIR)
        .join(format!("{}.db", savegame_identifier))
        .exists()
}

fn load_world_from_vcdbs(
    profile_path: &Path,
    save_path: &Path,
    profile_name: String,
) -> Result<World, UiError> {
    let conn = vcdbs::open(save_path, false)?;
    let gamedata = vcdbs::read_gamedata(&conn)?;

    let compressed = compress_gamedata(&gamedata);
    let has_map = has_map(profile_path, &gamedata.savegame_identifier);
    let map_markers = extract_map_markers(&gamedata);
    let prospecting_logs = extract_prospecting_logs(&gamedata)?;

    Ok(World {
        data: compressed,
        has_map,
        path: save_path.to_string_lossy().to_string(),
        profile_name,
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

fn saves_fingerprint(profiles_dir: &Path) -> Result<u64, UiError> {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    profiles_dir.hash(&mut hasher);

    for entry in read_dir(profiles_dir).map_err(|e| {
        log_error!("saves: Read dir error: {e}");
        UiError::new("io_error", format!("Read dir error: {e}"))
    })? {
        let entry = entry.map_err(|e| {
            log_error!("saves: Dir entry error: {e}");
            UiError::new("io_error", format!("Dir entry error: {e}"))
        })?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let saves_path = paths::saves_dir(&path);
        if !saves_path.is_dir() {
            continue;
        }

        for save_entry in read_dir(&saves_path).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::new("io_error", format!("Read dir error: {e}"))
        })? {
            let save_entry = save_entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::new("io_error", format!("Dir entry error: {e}"))
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

fn try_cached_saves(profiles_dir: &Path) -> Option<Vec<World>> {
    let fingerprint = saves_fingerprint(profiles_dir).ok()?;
    let cache = lock(saves_cache());
    let entry = cache.entries.get(profiles_dir)?;
    if entry.fingerprint == fingerprint {
        return Some(entry.worlds.clone());
    }
    None
}

fn store_saves_cache(profiles_dir: &Path, worlds: &[World]) {
    if let Ok(fingerprint) = saves_fingerprint(profiles_dir) {
        let mut cache = lock(saves_cache());
        {
            cache.entries.insert(
                profiles_dir.to_path_buf(),
                SavesCacheEntry {
                    fingerprint,
                    worlds: worlds.to_vec(),
                },
            );
        }
    }
}

/// Drops the cached save scan, forcing the next `scan_saves` to re-read
/// every database. Used by writers and by the cold-path benchmark.
pub fn invalidate_saves_cache() {
    let mut cache = lock(saves_cache());
    cache.entries.clear();
    log_info!("saves: invalidated save cache");
}

// ── Commands ──

/// Scan `profiles_dir` for all `.vcdbs` save files.
///
/// `extra_dirs` are adopted game data folders outside the profiles root.
pub fn scan_saves(profiles_dir: &Path, extra_dirs: &[PathBuf]) -> Result<Vec<World>, UiError> {
    if let Some(cached) = try_cached_saves(profiles_dir) {
        log_info!("saves: returning cached save list");
        return Ok(cached);
    }

    let mut saves: Vec<World> = Vec::new();

    let mut profile_dirs: Vec<(PathBuf, String)> = Vec::new();
    if profiles_dir.is_dir() {
        for entry in read_dir(profiles_dir).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::new("io_error", format!("Read dir error: {e}"))
        })? {
            let entry = entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::new("io_error", format!("Dir entry error: {e}"))
            })?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            profile_dirs.push((path, entry.file_name().into_string().unwrap_or_default()));
        }
    }
    // Adopted game data folders live outside the profiles root.
    for external in extra_dirs {
        profile_dirs.push((external.clone(), dir_name(external)));
    }

    for (path, profile_name) in profile_dirs {
        let saves_path = paths::saves_dir(&path);
        if !saves_path.exists() || !saves_path.is_dir() {
            continue;
        }

        for save_entry in read_dir(saves_path).map_err(|e| {
            log_error!("saves: Read dir error: {e}");
            UiError::new("io_error", format!("Read dir error: {e}"))
        })? {
            let save_entry = save_entry.map_err(|e| {
                log_error!("saves: Dir entry error: {e}");
                UiError::new("io_error", format!("Dir entry error: {e}"))
            })?;
            let save_path = save_entry.path();
            if !save_path.is_file() {
                continue;
            }
            if save_path.extension() != Some(OsStr::new("vcdbs")) {
                continue;
            }

            let world = load_world_from_vcdbs(&path, &save_path, profile_name.clone())?;
            saves.push(world);
        }
    }

    store_saves_cache(profiles_dir, &saves);
    Ok(saves)
}

#[command]
pub async fn get_all_saves(app: AppHandle) -> Result<Vec<World>, UiError> {
    log_info!("get_all_saves");
    let subdir = profiles_subdir(app.clone());
    let profile_dir_path = profiles_folder(app.clone())?.join(&subdir);
    let extra_dirs = super::profiles::external_profile_paths(&app);

    // Opens every .vcdbs and decodes protobuf: keep it off the UI thread.
    tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let result = scan_saves(&profile_dir_path, &extra_dirs);
        log_info!(
            "get_all_saves completed in {}ms",
            start.elapsed().as_millis()
        );
        result
    })
    .await
    .map_err(|e| {
        log_error!("get_all_saves: scan task failed: {e}");
        UiError::new("internal_error", format!("Saves scan failed: {e}"))
    })?
}

#[command]
pub fn update_world(
    app: AppHandle,
    profile_id: u64,
    world_path: String,
    name: String,
    identifier: Option<String>,
) -> Result<(), UiError> {
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let saves_path = paths::saves_dir(&pb);
    if !saves_path.exists() {
        create_dir_all(&saves_path).map_err(|e| {
            log_error!("saves: Create dir error: {e}");
            UiError::new("io_error", format!("Create dir error: {e}"))
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

    // Never overwrite an existing world: renaming to a taken name would
    // silently destroy the other world's save.
    if new_world_path.as_path() != world_path && new_world_path.exists() {
        return Err(UiError {
            name: "name_taken".into(),
            message: format!("A world named \"{file_name}\" already exists"),
        });
    }

    // Update the WorldName field before moving anything, so a DB failure
    // leaves the original file untouched.
    {
        let conn = vcdbs::open(world_path, true)?;
        let mut gamedata = vcdbs::read_gamedata(&conn)?;
        gamedata.world_name = name;
        vcdbs::write_gamedata(&conn, &gamedata)?;
    }

    // If an identifier is provided, and a Maps file is found with that identifier, move it too
    if let Some(id) = identifier {
        let maps_path = world_path
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join(paths::MAPS_DIR).join(format!("{}.db", id)));
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                let new_maps_path = pb.join(paths::MAPS_DIR).join(format!("{}.db", id));
                if new_maps_path != maps_path && new_maps_path.exists() {
                    return Err(UiError {
                        name: "maps_exists".into(),
                        message: format!("A Maps database for {id} already exists"),
                    });
                }
                let maps_dir = new_maps_path.parent().unwrap();
                if !maps_dir.exists() {
                    create_dir_all(maps_dir).map_err(|e| {
                        log_error!("saves: Create dir error: {e}");
                        UiError::new("io_error", format!("Create dir error: {e}"))
                    })?;
                }
                rename(maps_path, &new_maps_path).map_err(|e| {
                    log_error!("saves: Rename error: {e}");
                    UiError::new("io_error", format!("Rename error: {e}"))
                })?;
            }
        }
    }

    rename(world_path, &new_world_path).map_err(|e| {
        log_error!("saves: Rename error: {e}");
        UiError::new("io_error", format!("Rename error: {e}"))
    })?;
    invalidate_saves_cache();

    Ok(())
}

#[command]
pub fn remove_world(app: AppHandle, world_path: String) -> Result<(), UiError> {
    let world_path = Path::new(&world_path);
    require_managed_path(&app, world_path, "World path")?;
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

    let conn = vcdbs::open(world_path, false)?;
    let gamedata = vcdbs::read_gamedata(&conn)?;

    let maps_path = world_path.parent().and_then(|p| p.parent()).map(|p| {
        p.join(paths::MAPS_DIR)
            .join(format!("{}.db", gamedata.savegame_identifier))
    });
    if let Some(maps_path) = maps_path {
        if maps_path.exists() && maps_path.is_file() {
            remove_file(maps_path).map_err(|e| {
                log_error!("saves: Remove file error: {e}");
                UiError::new("io_error", format!("Remove file error: {e}"))
            })?;
        }
    }

    remove_file(world_path).map_err(|e| {
        log_error!("saves: Remove file error: {e}");
        UiError::new("io_error", format!("Remove file error: {e}"))
    })?;
    invalidate_saves_cache();
    Ok(())
}

// ── Per-world operations ──

/// Sanitized file stem for a new world file, matching `update_world`'s rules.
fn world_file_stem(name: &str) -> String {
    name.replace(
        |c: char| !c.is_ascii_alphanumeric() && c != ' ' && c != '_' && c != '-',
        "",
    )
    .to_lowercase()
}

/// Sidecar files of a save: every `<stem>.vcdbs*` except the save itself
/// (e.g. `my world.vcdbs-x-playerdata-1-data.bin`).
fn world_sidecars(saves_dir: &Path, stem: &str) -> Result<Vec<PathBuf>, UiError> {
    let prefix = format!("{stem}.vcdbs");
    let mut sidecars = Vec::new();
    if !saves_dir.exists() {
        return Ok(sidecars);
    }
    for entry in read_dir(saves_dir).map_err(|e| {
        log_error!("saves: Read dir error: {e}");
        UiError::new("io_error", format!("Read dir error: {e}"))
    })? {
        let entry = entry.map_err(|e| {
            log_error!("saves: Dir entry error: {e}");
            UiError::new("io_error", format!("Dir entry error: {e}"))
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if file_name != prefix && file_name.starts_with(&prefix) {
            sidecars.push(path);
        }
    }
    Ok(sidecars)
}

/// A free `<stem>.vcdbs` path in `saves_dir`, suffixed when the name is taken.
fn unique_world_path(saves_dir: &Path, stem: &str) -> Result<PathBuf, UiError> {
    let mut candidate = saves_dir.join(format!("{stem}.vcdbs"));
    let mut index = 2;
    while candidate.exists() {
        candidate = saves_dir.join(format!("{stem} {index}.vcdbs"));
        index += 1;
        if index > 100 {
            return Err(UiError::new(
                "name_taken",
                "Too many worlds share that name already",
            ));
        }
    }
    Ok(candidate)
}

fn ensure_world_save(world_path: &Path) -> Result<(), UiError> {
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError::new(
            "world_not_found",
            format!("World path {} not found", world_path.display()),
        ));
    }
    if world_path.extension() != Some(OsStr::new("vcdbs")) {
        return Err(UiError::new(
            "invalid_world_file",
            format!("World file {} is not a .vcdbs file", world_path.display()),
        ));
    }
    Ok(())
}

/// Copy a world (save + sidecars) under a new name. The copy gets a fresh
/// savegame identifier so map progress never bleeds between the two.
#[command]
pub fn duplicate_world(
    app: AppHandle,
    profile_id: u64,
    world_path: String,
    name: String,
) -> Result<(), UiError> {
    log_info!("duplicate_world: {}", name);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let saves_path = paths::saves_dir(&pb);
    create_dir_all(&saves_path).map_err(|e| {
        log_error!("saves: Create dir error: {e}");
        UiError::new("io_error", format!("Create dir error: {e}"))
    })?;
    let world_path = Path::new(&world_path);
    require_managed_path(&app, world_path, "World path")?;
    ensure_world_save(world_path)?;

    let new_stem = world_file_stem(&name);
    if new_stem.is_empty() {
        return Err(UiError::new(
            "invalid_name",
            "World name has no usable characters",
        ));
    }
    let new_path = saves_path.join(format!("{new_stem}.vcdbs"));
    if new_path.exists() {
        return Err(UiError::new(
            "name_taken",
            format!("A world named \"{new_stem}\" already exists"),
        ));
    }

    copy(world_path, &new_path).map_err(|e| {
        log_error!("saves: Copy error: {e}");
        UiError::new("io_error", format!("Copy error: {e}"))
    })?;

    let old_stem = world_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let old_prefix = format!("{old_stem}.vcdbs");
    for sidecar in world_sidecars(&saves_path, &old_stem)? {
        let file_name = sidecar
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let suffix = file_name.strip_prefix(&old_prefix).unwrap_or("");
        let dest = saves_path.join(format!("{new_stem}.vcdbs{suffix}"));
        copy(&sidecar, &dest).map_err(|e| {
            log_error!("saves: Copy error: {e}");
            UiError::new("io_error", format!("Copy error: {e}"))
        })?;
    }

    {
        let conn = vcdbs::open(&new_path, true)?;
        let mut gamedata = vcdbs::read_gamedata(&conn)?;
        gamedata.world_name = name;
        gamedata.savegame_identifier = uuid::Uuid::new_v4().to_string();
        vcdbs::write_gamedata(&conn, &gamedata)?;
    }

    invalidate_saves_cache();
    Ok(())
}

/// Zip a world (save, sidecars and its map database) to a chosen file.
#[command]
pub fn backup_world(
    app: AppHandle,
    profile_id: u64,
    world_path: String,
    dest_path: String,
) -> Result<(), UiError> {
    log_info!("backup_world: {}", dest_path);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let saves_path = paths::saves_dir(&pb);
    let world_path = Path::new(&world_path);
    ensure_world_save(world_path)?;

    let conn = vcdbs::open(world_path, false)?;
    let gamedata = vcdbs::read_gamedata(&conn)?;
    let stem = world_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut entries: Vec<(String, PathBuf)> =
        vec![(format!("{stem}.vcdbs"), world_path.to_path_buf())];
    for sidecar in world_sidecars(&saves_path, &stem)? {
        let name = sidecar
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        entries.push((name, sidecar));
    }
    if !gamedata.savegame_identifier.is_empty() {
        let map_path = pb
            .join(paths::MAPS_DIR)
            .join(format!("{}.db", gamedata.savegame_identifier));
        if map_path.is_file() {
            entries.push((
                format!("Maps/{}.db", gamedata.savegame_identifier),
                map_path,
            ));
        }
    }

    let file = File::create(&dest_path).map_err(|e| {
        log_error!("saves: Create file error: {e}");
        UiError::new("io_error", format!("Create file error: {e}"))
    })?;
    let mut writer = ZipWriter::new(file);
    let options = || SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, path) in entries {
        writer.start_file(&name, options()).map_err(|e| {
            log_error!("saves: Write zip error: {e}");
            UiError::new("io_error", format!("Write zip error: {e}"))
        })?;
        let mut source = File::open(&path).map_err(|e| {
            log_error!("saves: Open file error: {e}");
            UiError::new("io_error", format!("Open file error: {e}"))
        })?;
        io::copy(&mut source, &mut writer).map_err(|e| {
            log_error!("saves: Copy error: {e}");
            UiError::new("io_error", format!("Copy error: {e}"))
        })?;
    }
    writer.finish().map_err(|e| {
        log_error!("saves: Finalize zip error: {e}");
        UiError::new("io_error", format!("Finalize zip error: {e}"))
    })?;
    Ok(())
}

/// Extract a world archive exported by `backup_world`.
///
/// Every entry is validated first and only a `.vcdbs` save, its sidecars and
/// `Maps/<id>.db` are accepted; entry names never touch the filesystem as
/// paths, so a hostile archive cannot escape the profile.
fn extract_world_zip(source: &Path, saves_dir: &Path, maps_dir: &Path) -> Result<(), UiError> {
    let file = File::open(source).map_err(|e| {
        log_error!("saves: Open file error: {e}");
        UiError::new("io_error", format!("Open file error: {e}"))
    })?;
    let mut archive = ZipArchive::new(file).map_err(|e| {
        log_error!("saves: Read zip error: {e}");
        UiError::new(
            "invalid_archive",
            format!("Not a readable zip archive: {e}"),
        )
    })?;

    let mut stem: Option<String> = None;
    let mut save_entries: Vec<(String, usize)> = Vec::new();
    let mut map_entries: Vec<(String, usize)> = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| {
            log_error!("saves: Zip entry error: {e}");
            UiError::new("invalid_archive", format!("Zip entry error: {e}"))
        })?;
        if entry.is_dir() {
            continue;
        }
        let raw = entry.name().replace('\\', "/");
        let parts: Vec<&str> = raw
            .split('/')
            .filter(|part| !part.is_empty() && *part != ".")
            .collect();
        if parts.contains(&"..") {
            return Err(UiError::new(
                "invalid_archive",
                format!("Unexpected path in world archive: {raw}"),
            ));
        }
        match parts.as_slice() {
            [name] => {
                if name.ends_with(".vcdbs") {
                    let entry_stem = name.trim_end_matches(".vcdbs").to_string();
                    match &stem {
                        None => stem = Some(entry_stem),
                        Some(existing) if *existing != entry_stem => {
                            return Err(UiError::new(
                                "invalid_archive",
                                "The archive contains more than one world save",
                            ));
                        }
                        Some(_) => {}
                    }
                }
                save_entries.push(((*name).to_string(), index));
            }
            ["Maps", name] if name.ends_with(".db") => {
                map_entries.push(((*name).to_string(), index));
            }
            _ => {
                return Err(UiError::new(
                    "invalid_archive",
                    format!("Unexpected path in world archive: {raw}"),
                ));
            }
        }
    }

    let stem = stem.ok_or_else(|| {
        UiError::new(
            "invalid_archive",
            "The archive does not contain a world save",
        )
    })?;
    let dest = unique_world_path(saves_dir, &world_file_stem(&stem))?;
    let dest_stem = dest
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let old_prefix = format!("{stem}.vcdbs");

    for (name, index) in save_entries {
        let target_name = if name == old_prefix {
            format!("{dest_stem}.vcdbs")
        } else {
            name.replacen(&old_prefix, &format!("{dest_stem}.vcdbs"), 1)
        };
        let mut entry = archive.by_index(index).map_err(|e| {
            log_error!("saves: Zip entry error: {e}");
            UiError::new("invalid_archive", format!("Zip entry error: {e}"))
        })?;
        let target = saves_dir.join(&target_name);
        let mut out = File::create(&target).map_err(|e| {
            log_error!("saves: Create file error: {e}");
            UiError::new("io_error", format!("Create file error: {e}"))
        })?;
        io::copy(&mut entry, &mut out).map_err(|e| {
            log_error!("saves: Extract error: {e}");
            UiError::new("io_error", format!("Extract error: {e}"))
        })?;
    }

    for (name, index) in map_entries {
        if !maps_dir.exists() {
            create_dir_all(maps_dir).map_err(|e| {
                log_error!("saves: Create dir error: {e}");
                UiError::new("io_error", format!("Create dir error: {e}"))
            })?;
        }
        let target = maps_dir.join(&name);
        // Keep existing map progress when the identifier is already here.
        if target.exists() {
            continue;
        }
        let mut entry = archive.by_index(index).map_err(|e| {
            log_error!("saves: Zip entry error: {e}");
            UiError::new("invalid_archive", format!("Zip entry error: {e}"))
        })?;
        let mut out = File::create(&target).map_err(|e| {
            log_error!("saves: Create file error: {e}");
            UiError::new("io_error", format!("Create file error: {e}"))
        })?;
        io::copy(&mut entry, &mut out).map_err(|e| {
            log_error!("saves: Extract error: {e}");
            UiError::new("io_error", format!("Extract error: {e}"))
        })?;
    }
    Ok(())
}

/// Import a `.vcdbs` save (with sidecars sitting next to it) or a `.zip`
/// exported by `backup_world` into a profile.
#[command]
pub fn import_world(app: AppHandle, profile_id: u64, source_path: String) -> Result<(), UiError> {
    log_info!("import_world: {}", source_path);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let saves_path = paths::saves_dir(&pb);
    create_dir_all(&saves_path).map_err(|e| {
        log_error!("saves: Create dir error: {e}");
        UiError::new("io_error", format!("Create dir error: {e}"))
    })?;
    let maps_path = pb.join(paths::MAPS_DIR);
    let source = Path::new(&source_path);
    if !source.exists() || !source.is_file() {
        return Err(UiError::new(
            "file_not_found",
            format!("Import file {} not found", source.display()),
        ));
    }

    match source.extension().and_then(OsStr::to_str) {
        Some("vcdbs") => {
            let raw_stem = source
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
                .unwrap_or_default();
            let sanitized = world_file_stem(&raw_stem);
            let stem = if sanitized.is_empty() {
                "world".to_string()
            } else {
                sanitized
            };
            let dest = unique_world_path(&saves_path, &stem)?;
            copy(source, &dest).map_err(|e| {
                log_error!("saves: Copy error: {e}");
                UiError::new("io_error", format!("Copy error: {e}"))
            })?;
            let dest_stem = dest
                .file_stem()
                .map(|stem| stem.to_string_lossy().into_owned())
                .unwrap_or_default();
            if let Some(parent) = source.parent() {
                let old_prefix = format!("{raw_stem}.vcdbs");
                for sidecar in world_sidecars(parent, &raw_stem)? {
                    let file_name = sidecar
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let suffix = file_name.strip_prefix(&old_prefix).unwrap_or("");
                    let target = saves_path.join(format!("{dest_stem}.vcdbs{suffix}"));
                    copy(&sidecar, &target).map_err(|e| {
                        log_error!("saves: Copy error: {e}");
                        UiError::new("io_error", format!("Copy error: {e}"))
                    })?;
                }
            }
        }
        Some("zip") => extract_world_zip(source, &saves_path, &maps_path)?,
        _ => {
            return Err(UiError::new(
                "unsupported_file",
                "Pick a .vcdbs save or a .zip exported by Story Forge",
            ));
        }
    }

    invalidate_saves_cache();
    Ok(())
}
