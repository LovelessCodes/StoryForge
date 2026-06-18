use image::{ImageBuffer, ImageFormat, ImageReader, Rgba};
use prost::Message;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    fs::{metadata, read_dir},
    io::Cursor,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::proto::{GameData, MapPieceDb};
use super::utils::{generate_id, installations_folder, installations_subdir};
use crate::{log_error, log_info};

#[derive(Serialize, Deserialize, Debug)]
pub struct MapInfo {
    pub id: u64,
    pub name: String,
    pub installation_id: u64,
    pub installation_name: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Information about the Maps database structure
#[derive(Serialize, Deserialize, Debug)]
pub struct MapDatabaseInfo {
    pub exists: bool,
    pub tables: Vec<TableInfo>,
    pub tile_count: i64,
    pub sample_positions: Vec<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TableInfo {
    pub name: String,
    pub schema: String,
}

/// A single map tile with coordinates and image data
#[derive(Serialize, Deserialize, Debug)]
pub struct MapTile {
    pub x: i32,
    pub y: i32,
    pub position: i64,
    pub image_data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Map bounds (min/max coordinates)
#[derive(Serialize, Deserialize, Debug)]
pub struct MapBounds {
    pub min_x: i32,
    pub max_x: i32,
    pub min_y: i32,
    pub max_y: i32,
    pub tile_count: i64,
}

const COORD_BITS: i32 = 27;
const COORD_MASK: i64 = (1i64 << COORD_BITS) - 1;

/// Decode a bit-packed position into X and Y coordinates
pub fn decode_position(position: i64) -> (i32, i32) {
    let x = (position >> COORD_BITS) as i32;
    let y = (position & COORD_MASK) as i32;
    (x, y)
}

// ── Database helpers ──

fn open_sqlite_readonly(path: &Path) -> Result<Connection, UiError> {
    let uri = format!("file:{}?immutable=1", path.to_string_lossy());
    Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| {
        log_error!("maps: DB open error: {e}");
        UiError::from(format!("DB open error: {e}"))
    })
}

fn open_world_db(world_path: &Path) -> Result<Connection, UiError> {
    if !world_path.exists() || !world_path.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path.display()),
        });
    }
    open_sqlite_readonly(world_path)
}

fn read_gamedata(conn: &Connection) -> Result<GameData, UiError> {
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| {
            log_error!("maps: DB prepare error: {e}");
            UiError::from(format!("DB prepare error: {e}"))
        })?;

    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("maps: DB query error: {e}");
        UiError::from(format!("DB query error: {e}"))
    })?;

    if let Some(row) = rows.next().map_err(|e| {
        log_error!("maps: DB row error: {e}");
        UiError::from(format!("DB row error: {e}"))
    })? {
        let data: Vec<u8> = row.get(0).map_err(|e| {
            log_error!("maps: DB get error: {e}");
            UiError::from(format!("DB get error: {e}"))
        })?;
        GameData::decode(data.as_slice()).map_err(|e| {
            log_error!("maps: Protobuf decode error: {e}");
            UiError::from(format!("Protobuf decode error: {e}"))
        })
    } else {
        Err(UiError::from("No gamedata found"))
    }
}

fn maps_db_path(world_path: &Path, savegame_identifier: &str) -> Result<PathBuf, UiError> {
    world_path
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("Maps").join(format!("{}.db", savegame_identifier)))
        .ok_or_else(|| UiError::from("Could not determine Maps path"))
}

fn get_maps_db_path(world_path: &str) -> Result<PathBuf, UiError> {
    let world_path_obj = Path::new(world_path);
    let conn = open_world_db(world_path_obj)?;
    let gamedata = read_gamedata(&conn)?;
    let maps_path = maps_db_path(world_path_obj, &gamedata.savegame_identifier)?;

    if !maps_path.exists() {
        return Err(UiError {
            name: "maps_not_found".into(),
            message: "Maps database does not exist yet".into(),
        });
    }

    Ok(maps_path)
}

fn read_map_db(map_path: &str) -> Result<Connection, UiError> {
    open_sqlite_readonly(Path::new(map_path))
}

/// Whitelist-validate a dynamic table name. Table names must be non-empty,
/// contain only ASCII alphanumerics or underscores, and must not be internal
/// SQLite tables.
fn checked_table_name(name: &str) -> Result<&str, UiError> {
    if name.is_empty() {
        return Err(UiError::from("Map table name is empty"));
    }
    if name.starts_with("sqlite_") {
        return Err(UiError::from(format!(
            "Refusing to use internal SQLite table: {}",
            name
        )));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(UiError::from(format!(
            "Map table name contains invalid characters: {}",
            name
        )));
    }
    Ok(name)
}

fn find_map_table(conn: &Connection) -> Result<String, UiError> {
    let name: String = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| {
            log_error!("maps: Table query error: {e}");
            UiError::from(format!("Table query error: {e}"))
        })?;
    checked_table_name(&name)?;
    Ok(name)
}

/// Return an empty/default database info payload.
fn empty_db_info() -> MapDatabaseInfo {
    MapDatabaseInfo {
        exists: false,
        tables: Vec::new(),
        tile_count: 0,
        sample_positions: Vec::new(),
    }
}

// ── Commands ──

/// Scan `installations_dir` for Maps databases.
pub fn scan_maps(installations_dir: &Path) -> Result<Vec<MapInfo>, UiError> {
    let mut maps = Vec::new();

    if !installations_dir.is_dir() {
        return Ok(maps);
    }

    for entry in read_dir(installations_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read installations dir: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Dir entry error: {e}"),
        })?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let inst_name = entry.file_name().to_string_lossy().to_string();
        let inst_id = generate_id(&inst_name);

        let maps_dir = dir.join("Maps");
        if !maps_dir.is_dir() {
            continue;
        }

        for map_entry in read_dir(&maps_dir).map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read Maps dir: {e}"),
        })? {
            let map_entry = map_entry.map_err(|e| UiError {
                name: "io_error".into(),
                message: format!("Map entry error: {e}"),
            })?;
            let map_path = map_entry.path();
            if !map_path.is_file() {
                continue;
            }
            if map_path.extension().and_then(|e| e.to_str()) != Some("db") {
                continue;
            }
            let name = map_path
                .file_stem()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let size_bytes = metadata(&map_path).map(|m| m.len()).unwrap_or(0);
            let id = generate_id(&format!("{}|{}", inst_name, name));

            maps.push(MapInfo {
                id,
                name,
                installation_id: inst_id,
                installation_name: inst_name.clone(),
                path: map_path.to_string_lossy().to_string(),
                size_bytes,
            });
        }
    }

    Ok(maps)
}

/// Scan all installations for Maps databases
#[command]
pub fn get_all_maps(app: AppHandle) -> Result<Vec<MapInfo>, UiError> {
    log_info!("get_all_maps");
    let start = std::time::Instant::now();

    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);
    let result = scan_maps(&installations_dir);

    log_info!(
        "get_all_maps completed in {}ms",
        start.elapsed().as_millis()
    );
    result
}

/// Inspect the Maps database for a given world
#[command]
pub fn inspect_map_database(world_path: String) -> Result<MapDatabaseInfo, UiError> {
    let world_path_obj = Path::new(&world_path);
    let conn = open_world_db(world_path_obj)?;
    let gamedata = read_gamedata(&conn)?;

    let maps_path = maps_db_path(world_path_obj, &gamedata.savegame_identifier)?;
    if !maps_path.exists() {
        return Ok(empty_db_info());
    }

    let map_conn = open_sqlite_readonly(&maps_path)?;

    let mut tables = Vec::new();
    let mut table_stmt = map_conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
        .map_err(|e| {
            log_error!("maps: Schema query error: {e}");
            UiError::from(format!("Schema query error: {e}"))
        })?;

    let mut table_rows = table_stmt.query([]).map_err(|e| {
        log_error!("maps: Schema query error: {e}");
        UiError::from(format!("Schema query error: {e}"))
    })?;

    let mut main_table_name: Option<String> = None;

    while let Some(row) = table_rows.next().map_err(|e| {
        log_error!("maps: Schema row error: {e}");
        UiError::from(format!("Schema row error: {e}"))
    })? {
        let name: String = row.get(0).map_err(|e| {
            log_error!("maps: Schema name error: {e}");
            UiError::from(format!("Schema name error: {e}"))
        })?;
        let schema: Option<String> = row.get(1).ok();

        if checked_table_name(&name).is_ok() && main_table_name.is_none() {
            main_table_name = Some(name.clone());
        }

        tables.push(TableInfo {
            name,
            schema: schema.unwrap_or_default(),
        });
    }

    let (tile_count, sample_positions) = if let Some(table_name) = main_table_name {
        let count: i64 = map_conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        let mut pos_stmt = map_conn
            .prepare(&format!(
                "SELECT position FROM {} ORDER BY position LIMIT 20",
                table_name
            ))
            .map_err(|e| {
                log_error!("maps: Position query error: {e}");
                UiError::from(format!("Position query error: {e}"))
            })?;

        let mut pos_rows = pos_stmt.query([]).map_err(|e| {
            log_error!("maps: Position query error: {e}");
            UiError::from(format!("Position query error: {e}"))
        })?;

        let mut positions = Vec::new();
        while let Some(row) = pos_rows.next().map_err(|e| {
            log_error!("maps: Position row error: {e}");
            UiError::from(format!("Position row error: {e}"))
        })? {
            if let Ok(pos) = row.get::<_, i64>(0) {
                positions.push(pos);
            }
        }

        (count, positions)
    } else {
        (0, Vec::new())
    };

    Ok(MapDatabaseInfo {
        exists: true,
        tables,
        tile_count,
        sample_positions,
    })
}

/// Get the bounds (min/max X and Y) of all map tiles
#[command]
pub fn get_map_bounds(world_path: String) -> Result<MapBounds, UiError> {
    let maps_path = get_maps_db_path(&world_path)?;
    let conn = open_sqlite_readonly(&maps_path)?;
    let table_name = find_map_table(&conn)?;
    bounds_from_conn(&conn, &table_name)
}

fn bounds_from_conn(conn: &Connection, table_name: &str) -> Result<MapBounds, UiError> {
    let tile_count: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
            row.get(0)
        })
        .map_err(|e| {
            log_error!("maps: Count query error: {e}");
            UiError::from(format!("Count query error: {e}"))
        })?;

    let mut stmt = conn
        .prepare(&format!("SELECT position FROM {}", table_name))
        .map_err(|e| {
            log_error!("maps: Position query error: {e}");
            UiError::from(format!("Position query error: {e}"))
        })?;

    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("maps: Position query error: {e}");
        UiError::from(format!("Position query error: {e}"))
    })?;

    let mut min_x = i32::MAX;
    let mut max_x = i32::MIN;
    let mut min_y = i32::MAX;
    let mut max_y = i32::MIN;

    while let Some(row) = rows.next().map_err(|e| {
        log_error!("maps: Position row error: {e}");
        UiError::from(format!("Position row error: {e}"))
    })? {
        let position: i64 = row.get(0).map_err(|e| {
            log_error!("maps: Position get error: {e}");
            UiError::from(format!("Position get error: {e}"))
        })?;
        let (x, y) = decode_position(position);

        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }

    Ok(MapBounds {
        min_x,
        max_x,
        min_y,
        max_y,
        tile_count,
    })
}

/// Read a single map tile by position
#[command]
pub fn get_map_tile(world_path: String, position: i64) -> Result<MapTile, UiError> {
    let maps_path = get_maps_db_path(&world_path)?;
    let conn = open_sqlite_readonly(&maps_path)?;
    let table_name = find_map_table(&conn)?;

    let data: Vec<u8> = conn
        .query_row(
            &format!("SELECT data FROM {} WHERE position = ?1", table_name),
            [position],
            |row| row.get(0),
        )
        .map_err(|e| {
            log_error!("maps: Tile query error: {e}");
            UiError::from(format!("Tile query error: {e}"))
        })?;

    decode_tile(position, data)
}

/// Decode raw tile data (protobuf MapPieceDb or raw image bytes) into a `MapTile`.
fn decode_tile(position: i64, data: Vec<u8>) -> Result<MapTile, UiError> {
    let (x, y) = decode_position(position);

    let (image_data, width, height) = if let Ok(map_piece) = MapPieceDb::decode(data.as_slice()) {
        let pixel_count = map_piece.pixels.len();
        let size = (pixel_count as f64).sqrt() as u32;
        let png_data = pixels_to_png(&map_piece.pixels, size, size)?;
        (png_data, size, size)
    } else {
        let (width, height) = detect_image_dimensions(&data).unwrap_or((512, 512));
        (data, width, height)
    };

    Ok(MapTile {
        x,
        y,
        position,
        image_data,
        width,
        height,
    })
}

/// Get all map tiles for a world (legacy bulk API; prefer on-demand `get_map_tile`)
#[command]
pub fn get_all_map_tiles(world_path: String) -> Result<Vec<MapTile>, UiError> {
    let maps_path = get_maps_db_path(&world_path)?;
    let conn = open_sqlite_readonly(&maps_path)?;
    let table_name = find_map_table(&conn)?;

    let mut stmt = conn
        .prepare(&format!("SELECT position, data FROM {}", table_name))
        .map_err(|e| {
            log_error!("maps: Tile query error: {e}");
            UiError::from(format!("Tile query error: {e}"))
        })?;

    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("maps: Tile query error: {e}");
        UiError::from(format!("Tile query error: {e}"))
    })?;

    let mut tiles = Vec::new();
    while let Some(row) = rows.next().map_err(|e| {
        log_error!("maps: Tile row error: {e}");
        UiError::from(format!("Tile row error: {e}"))
    })? {
        let position: i64 = row.get(0).map_err(|e| {
            log_error!("maps: Position get error: {e}");
            UiError::from(format!("Position get error: {e}"))
        })?;
        let data: Vec<u8> = row.get(1).map_err(|e| {
            log_error!("maps: Data get error: {e}");
            UiError::from(format!("Data get error: {e}"))
        })?;
        tiles.push(decode_tile(position, data)?);
    }

    Ok(tiles)
}

/// Convert pixel array to PNG image
fn pixels_to_png(pixels: &[i32], width: u32, height: u32) -> Result<Vec<u8>, UiError> {
    let mut img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(width, height);

    for (i, pixel) in pixels.iter().enumerate() {
        let x = (i as u32) % width;
        let y = (i as u32) / width;

        if x >= width || y >= height {
            break;
        }

        // Decode ARGB from i32
        let r = (pixel & 0xFF) as u8;
        let g = ((pixel >> 8) & 0xFF) as u8;
        let b = ((pixel >> 16) & 0xFF) as u8;

        img.put_pixel(x, y, Rgba([r, g, b, 255]));
    }

    let mut png_bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| {
            log_error!("maps: PNG encoding error: {e}");
            UiError::from(format!("PNG encoding error: {e}"))
        })?;

    Ok(png_bytes)
}

/// Try to detect image dimensions from raw image data
fn detect_image_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    let reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .ok()?;
    let dimensions = reader.into_dimensions().ok()?;
    Some(dimensions)
}

// ── Direct-path variants (no world needed) ──

#[command]
pub fn get_map_bounds_by_path(map_path: String) -> Result<MapBounds, UiError> {
    log_info!("get_map_bounds_by_path");
    let conn = read_map_db(&map_path)?;
    let table_name = find_map_table(&conn)?;
    bounds_from_conn(&conn, &table_name)
}

#[command]
pub fn get_all_map_tiles_by_path(map_path: String) -> Result<Vec<MapTile>, UiError> {
    log_info!("get_all_map_tiles_by_path");
    let conn = read_map_db(&map_path)?;
    let table_name = find_map_table(&conn)?;

    let mut stmt = conn
        .prepare(&format!("SELECT position, data FROM {}", table_name))
        .map_err(|e| {
            log_error!("maps: Tile query error: {e}");
            UiError::from(format!("Tile query error: {e}"))
        })?;
    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("maps: Tile query error: {e}");
        UiError::from(format!("Tile query error: {e}"))
    })?;

    let mut tiles = Vec::new();
    while let Some(row) = rows.next().map_err(|e| {
        log_error!("maps: Tile row error: {e}");
        UiError::from(format!("Tile row error: {e}"))
    })? {
        let position: i64 = row.get(0).map_err(|e| {
            log_error!("maps: Position get error: {e}");
            UiError::from(format!("Position get error: {e}"))
        })?;
        let data: Vec<u8> = row.get(1).map_err(|e| {
            log_error!("maps: Data get error: {e}");
            UiError::from(format!("Data get error: {e}"))
        })?;
        tiles.push(decode_tile(position, data)?);
    }
    Ok(tiles)
}
