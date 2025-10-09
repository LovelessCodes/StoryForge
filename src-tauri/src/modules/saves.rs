use serde_json::{from_value, Value};
use std::{ffi::OsStr, path::Path};
use tauri::{command, AppHandle, Manager};
use tauri_plugin_zustand::ManagerExt;

use super::utils::{decode_map_markers, decode_prospecting_results, MapMarker, ProspectingResult};

use super::errors::UiError;
use super::proto::GameData;
use prost::Message;
use rusqlite::OpenFlags;

// The result should be a list of objects that contain the name of the save, and the installation it belongs to
// e.g. [{ name: "Save 1", installation: "Installation 1" }, { name: "Save 2", installation: "Installation 2" }]
#[command]
pub fn get_all_saves(
    app: AppHandle,
) -> Result<
    Vec<(
        GameData,
        String,
        String,
        Option<Vec<MapMarker>>,
        Vec<(String, Vec<ProspectingResult>)>,
    )>,
    UiError,
> {
    // Look through all installation folders and collect save names from the .vcdbs files
    let installation_dir_path = app.path().app_data_dir().unwrap().join("installations");
    let mut saves = Vec::new();
    if installation_dir_path.exists() && installation_dir_path.is_dir() {
        for entry in std::fs::read_dir(installation_dir_path)
            .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            let installation_name = entry.file_name().into_string().unwrap_or_default();
            if path.is_dir() {
                let saves_path = path.join("Saves");
                if saves_path.exists() && saves_path.is_dir() {
                    for save_entry in std::fs::read_dir(saves_path)
                        .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
                    {
                        let save_entry = save_entry
                            .map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
                        let save_path = save_entry.path();
                        if save_path.is_file() {
                            if let Some(ext) = save_path.extension() {
                                if ext == "vcdbs" {
                                    // Save the string representation before moving save_path
                                    let save_path_string = save_path
                                        .as_os_str()
                                        .to_os_string()
                                        .into_string()
                                        .unwrap_or_default();
                                    // Open said file as a sqlite database and read from the "gamedata" table, the data column from the first row
                                    // Open the sqlite file in read-only, immutable mode to prevent creation of -wal / -shm sidecar files
                                    // If the database was previously put into WAL mode by the game, merely opening it read/write
                                    // would cause SQLite to create those files. Using immutable=1 + READ_ONLY avoids that.
                                    let uri =
                                        format!("file:{}?immutable=1", save_path.to_string_lossy());
                                    let conn = rusqlite::Connection::open_with_flags(
                                        &uri,
                                        OpenFlags::SQLITE_OPEN_READ_ONLY
                                            | OpenFlags::SQLITE_OPEN_URI,
                                    )
                                    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
                                    let mut stmt =
                                        conn.prepare("SELECT data FROM gamedata LIMIT 1").map_err(
                                            |e| UiError::from(format!("DB prepare error: {e}")),
                                        )?;
                                    let mut rows = stmt.query([]).map_err(|e| {
                                        UiError::from(format!("DB query error: {e}"))
                                    })?;
                                    if let Some(row) = rows
                                        .next()
                                        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
                                    {
                                        let data: Vec<u8> = row.get(0).map_err(|e| {
                                            UiError::from(format!("DB get error: {e}"))
                                        })?;
                                        // The data is a protobuf string, we need to parse it to get the save name
                                        // The save name is stored in the "WorldName" field
                                        // Use prost to decode the protobuf string
                                        let gamedata =
                                            GameData::decode(data.as_slice()).map_err(|e| {
                                                UiError::from(format!("Protobuf decode error: {e}"))
                                            })?;
                                        // Only push a part of the gamedata, not the whole thing
                                        // e.g. only the world_name and savegame_identifier fields
                                        // This is to reduce the amount of data sent to the frontend
                                        let compressed_gamedata = GameData {
                                            world_name: gamedata.world_name.clone(),
                                            savegame_identifier: gamedata
                                                .savegame_identifier
                                                .clone(),
                                            seed: gamedata.seed,
                                            created_by_player_name: gamedata
                                                .created_by_player_name
                                                .clone(),
                                            created_game_version: gamedata
                                                .created_game_version
                                                .clone(),
                                            last_saved_game_version: gamedata
                                                .last_saved_game_version
                                                .clone(),
                                            last_played: gamedata.last_played,
                                            total_game_seconds: gamedata.total_game_seconds,
                                            total_game_seconds_start: gamedata
                                                .total_game_seconds_start,
                                            total_seconds_played: gamedata.total_seconds_played,
                                            world_type: gamedata.world_type.clone(),
                                            play_style: gamedata.play_style,
                                            ..Default::default()
                                        };
                                        let map_markers = gamedata
                                            .mod_data
                                            .get("playerMapMarkers_v2")
                                            .map(|data| decode_map_markers(data));

                                        // Save all prospecting results found in mod_data entries that start with "oreMapMarkers",
                                        // After the `oreMapMarkers-` part, the rest is a player uid that also needs to be saved
                                        // for later use
                                        let mut prospecting_results = Vec::new();
                                        for (key, value) in &gamedata.mod_data {
                                            if key.starts_with("oreMapMarkers-") {
                                                let player_uid =
                                                    key.strip_prefix("oreMapMarkers-").unwrap();
                                                let items = decode_prospecting_results(value);
                                                prospecting_results
                                                    .push((player_uid.to_string(), items));
                                            }
                                        }

                                        saves.push((
                                            compressed_gamedata,
                                            save_path_string,
                                            installation_name.clone(),
                                            map_markers,
                                            prospecting_results,
                                        ));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(saves)
}

#[command]
pub fn get_installation_saves(
    app: AppHandle,
    installation_id: u64,
) -> Result<Vec<String>, UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json.as_array().and_then(|arr| {
        arr.iter()
            .find(|inst| inst["id"].as_u64() == Some(installation_id))
    });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            // Optionally, log the error or handle it as needed
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let saves_path = Path::new(installation["path"].as_str().unwrap()).join("Saves");

    // Traverse the saves directory and collect save names from the .vcdbs files
    let mut saves = Vec::new();
    if saves_path.exists() && saves_path.is_dir() {
        for entry in std::fs::read_dir(saves_path)
            .map_err(|e| UiError::from(format!("Read dir error: {e}")))?
        {
            let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "vcdbs" {
                        if let Some(file_stem) = path.file_stem() {
                            if let Some(save_name) = file_stem.to_str() {
                                saves.push(save_name.to_string());
                            }
                        }
                    }
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
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json.as_array().and_then(|arr| {
        arr.iter()
            .find(|inst| inst["id"].as_u64() == Some(installation_id))
    });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            // Optionally, log the error or handle it as needed
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let saves_path = Path::new(installation["path"].as_str().unwrap()).join("Saves");
    if !saves_path.exists() {
        std::fs::create_dir_all(&saves_path)
            .map_err(|e| UiError::from(format!("Create dir error: {e}")))?;
    }
    let world_path = Path::new(&world_path);
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }

    if let Some(ext) = world_path.extension() {
        if ext != "vcdbs" {
            return Err(UiError {
                name: "invalid_world_file".into(),
                message: format!("World file {} is not a .vcdbs file", world_path.display()),
            });
        }
    } else {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!(
                "World file {} does not have an extension",
                world_path.display()
            ),
        });
    }

    // Rename the file to the new name, but sanitize it first and make it lowercase
    let file_name = name
        .replace(
            |c: char| !c.is_ascii_alphanumeric() && c != ' ' && c != '_' && c != '-',
            "",
        )
        .to_lowercase();
    let new_world_path = saves_path.join(format!("{}.vcdbs", file_name));
    // If an identifier is provided, and a Maps file is found with that identifier, move it too
    if let Some(id) = identifier {
        let maps_path = Path::new(&world_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Maps").join(format!("{}.db", id)));
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                let new_maps_path = Path::new(installation["path"].as_str().unwrap())
                    .join("Maps")
                    .join(format!("{}.db", id));
                // Ensure the Maps directory exists
                let maps_dir = new_maps_path.parent().unwrap();
                if !maps_dir.exists() {
                    std::fs::create_dir_all(maps_dir)
                        .map_err(|e| UiError::from(format!("Create dir error: {e}")))?;
                }
                std::fs::rename(maps_path, &new_maps_path)
                    .map_err(|e| UiError::from(format!("Rename error: {e}")))?;
            }
        }
    }
    std::fs::rename(world_path, &new_world_path)
        .map_err(|e| UiError::from(format!("Rename error: {e}")))?;

    // Update the "WorldName" field in the protobuf data inside the .vcdbs file
    let conn = rusqlite::Connection::open_with_flags(
        &new_world_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        // The data is a protobuf string, we need to parse it to get the save name
        // The save name is stored in the "WorldName" field
        // Use prost to decode the protobuf string
        let mut gamedata = GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?;
        gamedata.world_name = name.clone();
        // Re-encode the protobuf string
        let mut buf = Vec::new();
        gamedata
            .encode(&mut buf)
            .map_err(|e| UiError::from(format!("Protobuf encode error: {e}")))?;
        // Update the database with the new data
        conn.execute("UPDATE gamedata SET data = ?1", [&buf])
            .map_err(|e| UiError::from(format!("DB update error: {e}")))?;
    }
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
    // Check if the file has a .vcdbs extension
    if world_path.extension() != Some(OsStr::new("vcdbs")) {
        return Err(UiError {
            name: "invalid_world_file".into(),
            message: format!("World file {} is not a .vcdbs file", world_path.display()),
        });
    }

    // Update the "WorldName" field in the protobuf data inside the .vcdbs file
    let conn = rusqlite::Connection::open(&world_path)
        .map_err(|e| UiError::from(format!("DB open error: {e}")))?;
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;
    if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        // The data is a protobuf string, we need to parse it to get the save name
        // The save name is stored in the "WorldName" field
        // Use prost to decode the protobuf string
        let gamedata = GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?;

        let maps_path = Path::new(&world_path)
            .parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("Maps")
                    .join(format!("{}.db", gamedata.savegame_identifier))
            });
        if let Some(maps_path) = maps_path {
            if maps_path.exists() && maps_path.is_file() {
                std::fs::remove_file(maps_path)
                    .map_err(|e| UiError::from(format!("Remove file error: {e}")))?;
            }
        }
    }
    std::fs::remove_file(world_path)
        .map_err(|e| UiError::from(format!("Remove file error: {e}")))?;
    Ok(())
}
