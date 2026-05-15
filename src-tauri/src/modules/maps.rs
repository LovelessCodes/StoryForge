use image::{ImageBuffer, ImageFormat, ImageReader, Rgba};
use prost::Message;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    fs::read_dir,
    io::Cursor,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::proto::{GameData, MapPieceDb};

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
fn decode_position(position: i64) -> (i32, i32) {
    let x = (position >> COORD_BITS) as i32;
    let y = (position & COORD_MASK) as i32;
    (x, y)
}

/// Get the path to the Maps database for a given world
fn get_maps_db_path(world_path: &str) -> Result<PathBuf, UiError> {
    let world_path_obj = Path::new(world_path);
    if !world_path_obj.exists() || !world_path_obj.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path),
        });
    }

    // Open world database to get savegame_identifier
    let uri = format!("file:{}?immutable=1", world_path);
    let conn = Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;

    let gamedata = if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?
    } else {
        return Err(UiError::from("No gamedata found"));
    };

    // Get Maps database path
    let maps_path = world_path_obj
        .parent()
        .and_then(|p| p.parent())
        .map(|p| {
            p.join("Maps")
                .join(format!("{}.db", gamedata.savegame_identifier))
        })
        .ok_or_else(|| UiError::from("Could not determine Maps path"))?;

    if !maps_path.exists() {
        return Err(UiError {
            name: "maps_not_found".into(),
            message: "Maps database does not exist yet".into(),
        });
    }

    Ok(maps_path)
}

/// Scan all installations for Maps databases
#[command]
pub fn get_all_maps(app: AppHandle) -> Result<Vec<MapInfo>, UiError> {
    use super::utils::{installations_folder, installations_subdir};
    use std::fs::metadata;

    let subdir = installations_subdir(app.clone());
    let installations_dir = installations_folder(app.clone()).join(&subdir);
    let mut maps = Vec::new();

    if !installations_dir.is_dir() {
        return Ok(maps);
    }

    for entry in read_dir(&installations_dir).map_err(|e| UiError {
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
        let inst_id = super::installations::generate_id(&inst_name);

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

            // Generate id from installation_name + map_name
            let combined = format!("{}|{}", inst_name, name);
            let mut hash: u32 = 0x811c9dc5;
            for byte in combined.bytes() {
                hash ^= byte as u32;
                hash = hash.wrapping_mul(0x01000193);
            }

            maps.push(MapInfo {
                id: hash as u64,
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

/// Inspect the Maps database for a given world
#[command]
pub fn inspect_map_database(world_path: String) -> Result<MapDatabaseInfo, UiError> {
    // 1. Open the world database to get savegame_identifier
    let world_path_obj = Path::new(&world_path);
    if !world_path_obj.exists() || !world_path_obj.is_file() {
        return Err(UiError {
            name: "world_not_found".into(),
            message: format!("World path {} not found", world_path),
        });
    }

    // Open in immutable read-only mode
    let uri = format!("file:{}?immutable=1", world_path);
    let conn = Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("DB open error: {e}")))?;

    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| UiError::from(format!("DB prepare error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("DB query error: {e}")))?;

    let gamedata = if let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("DB row error: {e}")))?
    {
        let data: Vec<u8> = row
            .get(0)
            .map_err(|e| UiError::from(format!("DB get error: {e}")))?;
        GameData::decode(data.as_slice())
            .map_err(|e| UiError::from(format!("Protobuf decode error: {e}")))?
    } else {
        return Err(UiError::from("No gamedata found"));
    };

    // 2. Find the Maps database
    let maps_path = world_path_obj.parent().and_then(|p| p.parent()).map(|p| {
        p.join("Maps")
            .join(format!("{}.db", gamedata.savegame_identifier))
    });

    let maps_path = match maps_path {
        Some(p) if p.exists() => p,
        Some(_p) => {
            return Ok(MapDatabaseInfo {
                exists: false,
                tables: Vec::new(),
                tile_count: 0,
                sample_positions: Vec::new(),
            });
        }
        None => {
            return Ok(MapDatabaseInfo {
                exists: false,
                tables: Vec::new(),
                tile_count: 0,
                sample_positions: Vec::new(),
            });
        }
    };

    // 3. Inspect the Maps database
    let maps_uri = format!("file:{}?immutable=1", maps_path.to_string_lossy());
    let map_conn = Connection::open_with_flags(
        &maps_uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("Map DB open error: {e}")))?;

    // Get all tables
    let mut tables = Vec::new();
    let mut table_stmt = map_conn
        .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
        .map_err(|e| UiError::from(format!("Schema query error: {e}")))?;

    let mut table_rows = table_stmt
        .query([])
        .map_err(|e| UiError::from(format!("Schema query error: {e}")))?;

    let mut main_table_name: Option<String> = None;

    while let Some(row) = table_rows
        .next()
        .map_err(|e| UiError::from(format!("Schema row error: {e}")))?
    {
        let name: String = row.get(0).map_err(|e| UiError::from(format!("{e}")))?;
        let schema: Option<String> = row.get(1).ok();

        // Try to find the main map table (usually the first non-sqlite table)
        if !name.starts_with("sqlite_") && main_table_name.is_none() {
            main_table_name = Some(name.clone());
        }

        tables.push(TableInfo {
            name,
            schema: schema.unwrap_or_default(),
        });
    }

    // Get tile count and sample positions from the main table
    let (tile_count, sample_positions) = if let Some(table_name) = main_table_name {
        // Get count
        let count: i64 = map_conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        // Get sample positions (first 20)
        let mut pos_stmt = map_conn
            .prepare(&format!(
                "SELECT position FROM {} ORDER BY position LIMIT 20",
                table_name
            ))
            .map_err(|e| UiError::from(format!("Position query error: {e}")))?;

        let mut pos_rows = pos_stmt
            .query([])
            .map_err(|e| UiError::from(format!("Position query error: {e}")))?;

        let mut positions = Vec::new();
        while let Some(row) = pos_rows
            .next()
            .map_err(|e| UiError::from(format!("Position row error: {e}")))?
        {
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

    let maps_uri = format!("file:{}?immutable=1", maps_path.to_string_lossy());
    let map_conn = Connection::open_with_flags(
        &maps_uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("Map DB open error: {e}")))?;

    // Find the main table
    let table_name: String = map_conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| UiError::from(format!("Table query error: {e}")))?;

    // Get count
    let tile_count: i64 = map_conn
        .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
            row.get(0)
        })
        .map_err(|e| UiError::from(format!("Count query error: {e}")))?;

    // Get all positions to calculate bounds
    let mut stmt = map_conn
        .prepare(&format!("SELECT position FROM {}", table_name))
        .map_err(|e| UiError::from(format!("Position query error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("Position query error: {e}")))?;

    let mut min_x = i32::MAX;
    let mut max_x = i32::MIN;
    let mut min_y = i32::MAX;
    let mut max_y = i32::MIN;

    while let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("Position row error: {e}")))?
    {
        let position: i64 = row.get(0).map_err(|e| UiError::from(format!("{e}")))?;
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

/// Read a single map tile by position (for testing)
#[command]
pub fn get_map_tile(world_path: String, position: i64) -> Result<MapTile, UiError> {
    let maps_path = get_maps_db_path(&world_path)?;

    let maps_uri = format!("file:{}?immutable=1", maps_path.to_string_lossy());
    let map_conn = Connection::open_with_flags(
        &maps_uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("Map DB open error: {e}")))?;

    // Find the main table
    let table_name: String = map_conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| UiError::from(format!("Table query error: {e}")))?;

    // Get the tile data
    let data: Vec<u8> = map_conn
        .query_row(
            &format!("SELECT data FROM {} WHERE position = ?1", table_name),
            [position],
            |row| row.get(0),
        )
        .map_err(|e| UiError::from(format!("Tile query error: {e}")))?;

    let (x, y) = decode_position(position);

    // Try to decode as protobuf MapPieceDb first, otherwise assume it's raw image data
    let (image_data, width, height) = if let Ok(map_piece) = MapPieceDb::decode(data.as_slice()) {
        // It's a protobuf - need to convert pixels to image
        // Assume 512x512 for now (we'll adjust based on actual data)
        let pixel_count = map_piece.pixels.len();
        let size = (pixel_count as f64).sqrt() as u32;

        // Convert pixels to PNG
        let png_data = pixels_to_png(&map_piece.pixels, size, size)?;
        (png_data, size, size)
    } else {
        // It's already image data (PNG/JPG)
        // Try to detect dimensions
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

/// Get all map tiles for a world
#[command]
pub fn get_all_map_tiles(world_path: String) -> Result<Vec<MapTile>, UiError> {
    let maps_path = get_maps_db_path(&world_path)?;

    let maps_uri = format!("file:{}?immutable=1", maps_path.to_string_lossy());
    let map_conn = Connection::open_with_flags(
        &maps_uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("Map DB open error: {e}")))?;

    // Find the main table
    let table_name: String = map_conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| UiError::from(format!("Table query error: {e}")))?;

    let mut stmt = map_conn
        .prepare(&format!("SELECT position, data FROM {}", table_name))
        .map_err(|e| UiError::from(format!("Tile query error: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("Tile query error: {e}")))?;

    let mut tiles = Vec::new();

    while let Some(row) = rows
        .next()
        .map_err(|e| UiError::from(format!("Tile row error: {e}")))?
    {
        let position: i64 = row.get(0).map_err(|e| UiError::from(format!("{e}")))?;
        let data: Vec<u8> = row.get(1).map_err(|e| UiError::from(format!("{e}")))?;

        let (x, y) = decode_position(position);

        // Try to decode as protobuf MapPieceDb first
        let (image_data, width, height) = if let Ok(map_piece) = MapPieceDb::decode(data.as_slice())
        {
            let pixel_count = map_piece.pixels.len();
            let size = (pixel_count as f64).sqrt() as u32;
            let png_data = pixels_to_png(&map_piece.pixels, size, size)?;
            (png_data, size, size)
        } else {
            let (width, height) = detect_image_dimensions(&data).unwrap_or((512, 512));
            (data, width, height)
        };

        tiles.push(MapTile {
            x,
            y,
            position,
            image_data,
            width,
            height,
        });
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
        .map_err(|e| UiError::from(format!("PNG encoding error: {e}")))?;

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

fn read_map_db(map_path: &str) -> Result<Connection, UiError> {
    let uri = format!("file:{}?immutable=1", map_path);
    Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| UiError::from(format!("Map DB open error: {e}")))
}

fn find_map_table(conn: &Connection) -> Result<String, UiError> {
    conn.query_row(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
        [],
        |row| row.get(0),
    )
    .map_err(|e| UiError::from(format!("Table query error: {e}")))
}

#[command]
pub fn get_map_bounds_by_path(map_path: String) -> Result<MapBounds, UiError> {
    let conn = read_map_db(&map_path)?;
    let table_name = find_map_table(&conn)?;

    let tile_count: i64 = conn
        .query_row(&format!("SELECT COUNT(*) FROM {}", table_name), [], |row| {
            row.get(0)
        })
        .map_err(|e| UiError::from(format!("Count query error: {e}")))?;

    let mut stmt = conn
        .prepare(&format!("SELECT position FROM {}", table_name))
        .map_err(|e| UiError::from(format!("Position query error: {e}")))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("Position query error: {e}")))?;

    let mut min_x = i32::MAX;
    let mut max_x = i32::MIN;
    let mut min_y = i32::MAX;
    let mut max_y = i32::MIN;

    while let Some(row) = rows.next().map_err(|e| UiError::from(format!("{e}")))? {
        let position: i64 = row.get(0).map_err(|e| UiError::from(format!("{e}")))?;
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

#[command]
pub fn get_all_map_tiles_by_path(map_path: String) -> Result<Vec<MapTile>, UiError> {
    let conn = read_map_db(&map_path)?;
    let table_name = find_map_table(&conn)?;

    let mut stmt = conn
        .prepare(&format!("SELECT position, data FROM {}", table_name))
        .map_err(|e| UiError::from(format!("Tile query error: {e}")))?;
    let mut rows = stmt
        .query([])
        .map_err(|e| UiError::from(format!("Tile query error: {e}")))?;

    let mut tiles = Vec::new();
    while let Some(row) = rows.next().map_err(|e| UiError::from(format!("{e}")))? {
        let position: i64 = row.get(0).map_err(|e| UiError::from(format!("{e}")))?;
        let data: Vec<u8> = row.get(1).map_err(|e| UiError::from(format!("{e}")))?;
        let (x, y) = decode_position(position);
        let (image_data, width, height) = if let Ok(map_piece) = MapPieceDb::decode(data.as_slice())
        {
            let pixel_count = map_piece.pixels.len();
            let size = (pixel_count as f64).sqrt() as u32;
            let png_data = pixels_to_png(&map_piece.pixels, size, size)?;
            (png_data, size, size)
        } else {
            let (w, h) = detect_image_dimensions(&data).unwrap_or((512, 512));
            (data, w, h)
        };
        tiles.push(MapTile {
            x,
            y,
            position,
            image_data,
            width,
            height,
        });
    }
    Ok(tiles)
}
