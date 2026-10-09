//! Shared helpers for Vintage Story `.vcdbs` databases.
//!
//! Both save games and map databases are SQLite files whose `gamedata` table
//! holds a protobuf `GameData` blob.

use prost::Message;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

use super::errors::UiError;
use super::proto::GameData;
use crate::log_error;

/// Escapes the characters SQLite's URI parser would otherwise interpret.
///
/// `%` must be escaped first, or it would double-escape the `%` of the escapes
/// added below.
fn escape_uri_path(path: &str) -> String {
    path.replace('%', "%25")
        .replace('#', "%23")
        .replace('?', "%3F")
}

/// Opens a `.vcdbs` database.
///
/// Read-only opens use SQLite's `immutable` flag so reads never create
/// `-wal`/`-shm` files next to a running game. Trade-off: concurrent writes by
/// the game are not detected, so values can be briefly stale.
pub fn open(path: &Path, writable: bool) -> Result<Connection, UiError> {
    if writable {
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE).map_err(|e| {
            log_error!("vcdbs: DB open error: {e}");
            UiError::new("db_error", format!("DB open error: {e}"))
        })
    } else {
        let uri = format!(
            "file:{}?immutable=1",
            escape_uri_path(&path.to_string_lossy())
        );
        Connection::open_with_flags(
            &uri,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        )
        .map_err(|e| {
            log_error!("vcdbs: DB open error: {e}");
            UiError::new("db_error", format!("DB open error: {e}"))
        })
    }
}

/// Opens a `.vcdbs` database read-only.
///
/// See [`open`] for the immutable-flag trade-off.
pub fn open_readonly(path: &Path) -> Result<Connection, UiError> {
    open(path, false)
}

/// Reads the protobuf `GameData` blob from the `gamedata` table.
pub fn read_gamedata(conn: &Connection) -> Result<GameData, UiError> {
    let mut stmt = conn
        .prepare("SELECT data FROM gamedata LIMIT 1")
        .map_err(|e| {
            log_error!("vcdbs: DB prepare error: {e}");
            UiError::new("db_error", format!("DB prepare error: {e}"))
        })?;

    let mut rows = stmt.query([]).map_err(|e| {
        log_error!("vcdbs: DB query error: {e}");
        UiError::new("db_error", format!("DB query error: {e}"))
    })?;

    let Some(row) = rows.next().map_err(|e| {
        log_error!("vcdbs: DB row error: {e}");
        UiError::new("db_error", format!("DB row error: {e}"))
    })?
    else {
        return Err(UiError::new("not_found", "No gamedata found"));
    };

    let data: Vec<u8> = row.get(0).map_err(|e| {
        log_error!("vcdbs: DB get error: {e}");
        UiError::new("db_error", format!("DB get error: {e}"))
    })?;

    GameData::decode(data.as_slice()).map_err(|e| {
        log_error!("vcdbs: Protobuf decode error: {e}");
        UiError::new("decode_error", format!("Protobuf decode error: {e}"))
    })
}

/// Writes the protobuf `GameData` blob back to the `gamedata` table.
pub fn write_gamedata(conn: &Connection, gamedata: &GameData) -> Result<(), UiError> {
    let mut buf = Vec::new();
    gamedata.encode(&mut buf).map_err(|e| {
        log_error!("vcdbs: Protobuf encode error: {e}");
        UiError::new("encode_error", format!("Protobuf encode error: {e}"))
    })?;

    conn.execute("UPDATE gamedata SET data = ?1", [&buf])
        .map_err(|e| {
            log_error!("vcdbs: DB update error: {e}");
            UiError::new("db_error", format!("DB update error: {e}"))
        })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gamedata_round_trips() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE gamedata (data BLOB)", [])
            .unwrap();

        // write_gamedata updates the existing row, as in real .vcdbs files.
        conn.execute("INSERT INTO gamedata (data) VALUES (X'00')", [])
            .unwrap();

        let gamedata = GameData {
            world_name: "Test World".into(),
            savegame_identifier: "abc".into(),
            ..Default::default()
        };
        write_gamedata(&conn, &gamedata).unwrap();

        let read = read_gamedata(&conn).unwrap();
        assert_eq!(read.world_name, "Test World");
        assert_eq!(read.savegame_identifier, "abc");
    }

    #[test]
    fn missing_gamedata_is_not_found() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE gamedata (data BLOB)", [])
            .unwrap();
        assert_eq!(read_gamedata(&conn).unwrap_err().name, "not_found");
    }

    #[test]
    fn escapes_uri_metacharacters() {
        assert_eq!(escape_uri_path("plain/path.vcdbs"), "plain/path.vcdbs");
        assert_eq!(
            escape_uri_path("/tmp/50%#1?x.vcdbs"),
            "/tmp/50%25%231%3Fx.vcdbs"
        );
    }

    /// Without escaping, the URI parser truncates at `?`/`#` and percent-decodes
    /// `%`, so the read-only open would hit the wrong (or no) file.
    #[test]
    fn readonly_open_handles_uri_metacharacters() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("world%20#1?save.vcdbs");

        let conn = Connection::open(&path).unwrap();
        conn.execute("CREATE TABLE gamedata (data BLOB)", [])
            .unwrap();
        conn.execute("INSERT INTO gamedata (data) VALUES (X'00')", [])
            .unwrap();
        write_gamedata(
            &conn,
            &GameData {
                world_name: "Weird Path".into(),
                ..Default::default()
            },
        )
        .unwrap();
        drop(conn);

        let conn = open_readonly(&path).unwrap();
        assert_eq!(read_gamedata(&conn).unwrap().world_name, "Weird Path");
    }
}
