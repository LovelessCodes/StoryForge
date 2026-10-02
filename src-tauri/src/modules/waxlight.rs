//! Import of Waxlight Launcher (AmadoMuerte) instances as Story Forge profiles.
//!
//! Waxlight keeps a fixed home at `<OS config dir>/waxlight` that holds only a
//! plain-text `data-root` pointer; the heavy data (and `waxlight.db`, SQLite)
//! lives in the movable data root (default = the home itself). Instances are
//! rows in the `instances` table whose `directory` is the game data path — the
//! same shape as a profile:
//!
//! ```text
//! instances(id, name, game_version_id, directory, launch_arguments,
//!           environment_variables, is_pinned, last_played_at, …)
//! game_versions(id, name, …)              -- version string lives in `name`
//! play_sessions(instance_id, duration_sec, …)
//! ```
//!
//! `directory` may be stored relative to the data root (schema v11); paths are
//! resolved before import. Older schemas are tolerated by selecting only the
//! columns that exist. `launch_arguments` is a JSON string array (re-quoted so
//! Story Forge's shell-word parsing round-trips it), `environment_variables` a
//! JSON object, `is_pinned` maps to our favorite flag and the summed
//! `play_sessions.duration_sec` to total playtime. Covers use Waxlight's own
//! artwork and are not carried over.

use std::{
    collections::{HashMap, HashSet},
    fs::{create_dir_all, read_to_string, write},
    path::{Path, PathBuf},
};

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::legacy::{
    copy_profile_dir, free_profile_dir, LegacyMigrationReport, LegacyMigrationSkip,
};
use super::paths::{MODS_DIR, PROFILE_JSON};
use super::profiles::{
    is_external_profile_dir, read_profile_json, write_profile_json, ProfileInfo,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, normalize_path, profiles_folder, profiles_subdir,
    require_managed_path,
};
use crate::log_info;

const WAXLIGHT_DIR: &str = "waxlight";
const DATA_ROOT_POINTER: &str = "data-root";
const DB_FILE: &str = "waxlight.db";
const MIGRATION_LOG_FILE: &str = "waxlight-migration.json";

#[derive(Debug, Clone, Serialize)]
pub struct WaxlightInstance {
    pub id: String,
    pub name: String,
    pub version: String,
    pub path: String,
    /// Constant "Waxlight Launcher"; kept so every importer reports the same shape.
    pub source: String,
    pub mod_count: usize,
    pub size_bytes: u64,
    pub size_display: String,
    pub has_saves: bool,
    pub last_time_played: Option<u64>,
    /// Points at the game's own default data folder.
    pub is_default_game_data: bool,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WaxlightMigrationEntry {
    source_path: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct WaxlightMigrationLog {
    #[serde(default)]
    migrations: Vec<WaxlightMigrationEntry>,
}

#[derive(Debug, Clone)]
struct WaxlightRow {
    id: String,
    name: String,
    directory: PathBuf,
    version: String,
    launch_arguments: Vec<String>,
    environment_variables: HashMap<String, String>,
    pinned: bool,
    last_played: Option<u64>,
    total_seconds: u64,
}

/// `<OS config dir>` (Waxlight's fixed home parent).
fn config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            return Some(home.join("Library/Application Support"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            return Some(appdata);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(config) = std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from) {
            return Some(config);
        }
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            return Some(home.join(".config"));
        }
    }

    None
}

fn waxlight_home() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join(WAXLIGHT_DIR))
}

/// The movable data root: the `data-root` pointer when it names an existing
/// folder, otherwise the home directory itself.
fn data_root(home: &Path) -> PathBuf {
    if let Ok(value) = read_to_string(home.join(DATA_ROOT_POINTER)) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return path;
            }
        }
    }
    home.to_path_buf()
}

/// Resolves a stored instance directory (absolute or data-root relative).
fn resolve_directory(raw: &str, root: &Path) -> PathBuf {
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

fn table_exists(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .unwrap_or(false)
}

fn table_columns(conn: &Connection, table: &str) -> HashSet<String> {
    let mut columns = HashSet::new();
    let Ok(mut statement) = conn.prepare(&format!("PRAGMA table_info({table})")) else {
        return columns;
    };
    let Ok(mut rows) = statement.query([]) else {
        return columns;
    };
    while let Ok(Some(row)) = rows.next() {
        if let Ok(name) = row.get::<_, String>(1) {
            columns.insert(name);
        }
    }
    columns
}

/// Reads every instance from an open database.
fn read_rows_from_connection(conn: &Connection, root: &Path) -> Result<Vec<WaxlightRow>, UiError> {
    let columns = table_columns(conn, "instances");
    for required in ["id", "name", "directory"] {
        if !columns.contains(required) {
            return Err(UiError::new(
                "parse_failed",
                "Unexpected Waxlight database schema",
            ));
        }
    }

    let mut selected: Vec<&str> = vec!["id", "name", "directory"];
    for optional in [
        "game_version_id",
        "launch_arguments",
        "environment_variables",
        "is_pinned",
        "last_played_at",
    ] {
        if columns.contains(optional) {
            selected.push(optional);
        }
    }

    let mut version_names: HashMap<String, String> = HashMap::new();
    if table_exists(conn, "game_versions") {
        if let Ok(mut statement) = conn.prepare("SELECT id, name FROM game_versions") {
            if let Ok(mut rows) = statement.query([]) {
                while let Ok(Some(row)) = rows.next() {
                    if let (Ok(id), Ok(name)) = (row.get::<_, String>(0), row.get::<_, String>(1)) {
                        version_names.insert(id, name);
                    }
                }
            }
        }
    }

    let mut play_seconds: HashMap<String, u64> = HashMap::new();
    if table_exists(conn, "play_sessions") {
        if let Ok(mut statement) = conn.prepare(
            "SELECT instance_id, COALESCE(SUM(duration_sec), 0) FROM play_sessions GROUP BY instance_id",
        ) {
            if let Ok(mut rows) = statement.query([]) {
                while let Ok(Some(row)) = rows.next() {
                    if let (Ok(id), Ok(total)) =
                        (row.get::<_, String>(0), row.get::<_, i64>(1))
                    {
                        play_seconds.insert(id, total.max(0) as u64);
                    }
                }
            }
        }
    }

    let sql = format!("SELECT {} FROM instances", selected.join(", "));
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| UiError::new("db_error", format!("Failed to read instances: {e}")))?;
    let mut rows = statement
        .query([])
        .map_err(|e| UiError::new("db_error", format!("Failed to read instances: {e}")))?;

    let index_of: HashMap<&str, usize> = selected
        .iter()
        .enumerate()
        .map(|(index, name)| (*name, index))
        .collect();

    let mut out = Vec::new();
    while let Some(row) = rows
        .next()
        .map_err(|e| UiError::new("db_error", format!("Failed to read instance row: {e}")))?
    {
        let id: String = row.get(0).unwrap_or_default();
        let name: String = row.get(1).unwrap_or_default();
        let directory_raw: String = row.get(2).unwrap_or_default();

        let game_version_id = index_of
            .get("game_version_id")
            .and_then(|index| row.get::<_, Option<String>>(*index).ok().flatten())
            .unwrap_or_default();
        let launch_arguments = index_of
            .get("launch_arguments")
            .and_then(|index| row.get::<_, Option<String>>(*index).ok().flatten())
            .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
            .unwrap_or_default();
        let environment_variables = index_of
            .get("environment_variables")
            .and_then(|index| row.get::<_, Option<String>>(*index).ok().flatten())
            .and_then(|raw| serde_json::from_str::<HashMap<String, String>>(&raw).ok())
            .unwrap_or_default();
        let pinned = index_of
            .get("is_pinned")
            .and_then(|index| row.get::<_, Option<i64>>(*index).ok().flatten())
            .unwrap_or(0)
            != 0;
        let last_played = index_of
            .get("last_played_at")
            .and_then(|index| row.get::<_, Option<String>>(*index).ok().flatten())
            .and_then(|raw| parse_rfc3339_millis(&raw));

        out.push(WaxlightRow {
            version: version_names
                .get(&game_version_id)
                .cloned()
                .unwrap_or_default(),
            total_seconds: play_seconds.get(&id).copied().unwrap_or(0),
            directory: resolve_directory(&directory_raw, root),
            id,
            name,
            launch_arguments,
            environment_variables,
            pinned,
            last_played,
        });
    }

    Ok(out)
}

fn read_rows(root: &Path) -> Result<Vec<WaxlightRow>, UiError> {
    let db_path = root.join(DB_FILE);
    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| {
        UiError::new(
            "db_error",
            format!("Failed to open the Waxlight database: {e}"),
        )
    })?;
    read_rows_from_connection(&conn, root)
}

/// Minimal RFC3339 parser for Go's `RFC3339Nano` output; returns epoch ms.
fn parse_rfc3339_millis(value: &str) -> Option<u64> {
    let bytes = value.as_bytes();
    if bytes.len() < 19 || value.as_bytes().get(4) != Some(&b'-') {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let rest = &value[19..];
    let (fraction_millis, rest) = if let Some(fraction) = rest.strip_prefix('.') {
        let digits: String = fraction.chars().take_while(char::is_ascii_digit).collect();
        if digits.is_empty() {
            return None;
        }
        let mut millis = digits.clone();
        millis.truncate(3);
        while millis.len() < 3 {
            millis.push('0');
        }
        (millis.parse::<i64>().ok()?, &fraction[digits.len()..])
    } else {
        (0, rest)
    };

    let offset_minutes = if rest.is_empty() || rest.eq_ignore_ascii_case("z") {
        0
    } else {
        let offset = rest.strip_prefix(['+', '-'])?;
        let sign = if rest.starts_with('-') { -1 } else { 1 };
        let hours: i64 = offset.get(0..2)?.parse().ok()?;
        let minutes: i64 = offset.get(3..5)?.parse().ok()?;
        sign * (hours * 60 + minutes)
    };

    // Days from civil (Howard Hinnant's algorithm).
    let adjusted_year = if month <= 2 { year - 1 } else { year };
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let month_prime = (month + 9) % 12;
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era - 719_468;

    let seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    if seconds < 0 {
        return None;
    }
    Some((seconds as u64) * 1000 + fraction_millis as u64)
}

/// Re-quotes launch arguments so `parse_start_params` (shell words) restores
/// the original argument list.
fn args_to_command(args: &[String]) -> String {
    args.iter()
        .map(|arg| {
            if !arg.is_empty()
                && arg
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_./=:+".contains(c))
            {
                arg.clone()
            } else {
                format!("'{}'", arg.replace('\'', "'\\''"))
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Game versions installed by Waxlight (its `game_versions` table), ready to
/// be linked into Story Forge.
pub(crate) fn detected_game_versions() -> Vec<super::versions::DetectedVersion> {
    let Some(home) = waxlight_home() else {
        return Vec::new();
    };
    let root = data_root(&home);
    let db_path = root.join(DB_FILE);
    if !db_path.is_file() {
        return Vec::new();
    }
    let Ok(conn) = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return Vec::new();
    };
    game_versions_from_connection(&conn, &root)
        .into_iter()
        .filter(|(name, path)| {
            !name.trim().is_empty() && super::versions::looks_like_game_dir(path)
        })
        .map(|(name, path)| super::versions::DetectedVersion {
            name,
            path: path.to_string_lossy().to_string(),
            source: "Waxlight Launcher".into(),
        })
        .collect()
}

fn game_versions_from_connection(conn: &Connection, root: &Path) -> Vec<(String, PathBuf)> {
    let columns = table_columns(conn, "game_versions");
    if !columns.contains("name") || !columns.contains("installation_dir") {
        return Vec::new();
    }
    let mut out = Vec::new();
    if let Ok(mut statement) = conn.prepare("SELECT name, installation_dir FROM game_versions") {
        if let Ok(mut rows) = statement.query([]) {
            while let Ok(Some(row)) = rows.next() {
                let name: String = row.get(0).unwrap_or_default();
                let directory: String = row.get(1).unwrap_or_default();
                if directory.trim().is_empty() {
                    continue;
                }
                out.push((name, resolve_directory(&directory, root)));
            }
        }
    }
    out
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

fn read_migration_log(app: &AppHandle) -> WaxlightMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &WaxlightMigrationLog) -> Result<(), UiError> {
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

fn count_zips(dir: &Path) -> usize {
    std::fs::read_dir(dir.join(MODS_DIR))
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

/// Lists Waxlight instances that can be imported.
#[command]
pub async fn detect_waxlight_instances(app: AppHandle) -> Result<Vec<WaxlightInstance>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Waxlight scan failed: {e}")))?
}

fn detect_blocking(app: &AppHandle) -> Result<Vec<WaxlightInstance>, UiError> {
    let Some(home) = waxlight_home() else {
        return Ok(Vec::new());
    };
    let root = data_root(&home);
    if !root.join(DB_FILE).is_file() {
        return Ok(Vec::new());
    }
    log_info!("waxlight: reading {}", root.join(DB_FILE).display());

    let rows = read_rows(&root)?;
    let log = read_migration_log(app);
    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let game_data_candidates = super::game_data::default_data_candidates();
    let mut results = Vec::new();

    for row in rows {
        let path = row.directory.clone();
        if !path.is_dir() {
            continue;
        }
        if normalize_path(&path).starts_with(normalize_path(&profiles_root))
            || is_external_profile_dir(app, &path)
        {
            continue;
        }
        let folder = dir_name(&path);
        if folder.is_empty() || folder.starts_with('.') {
            continue;
        }

        let already_imported = log.migrations.iter().any(|entry| {
            normalize_path(Path::new(&entry.source_path)) == normalize_path(&path)
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });
        let is_default_game_data = game_data_candidates
            .iter()
            .any(|candidate| normalize_path(candidate) == normalize_path(&path));

        let size_bytes = dir_size_cached(&path);
        results.push(WaxlightInstance {
            id: row.id,
            name: if row.name.trim().is_empty() {
                folder
            } else {
                row.name
            },
            version: row.version,
            path: path.to_string_lossy().to_string(),
            source: "Waxlight Launcher".into(),
            mod_count: count_zips(&path),
            size_bytes,
            size_display: format_size(size_bytes),
            has_saves: path.join("Saves").is_dir(),
            last_time_played: row.last_played,
            is_default_game_data,
            already_imported,
        });
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("waxlight: found {} instance(s)", results.len());
    Ok(results)
}

/// Imports Waxlight instances into the profiles folder.
///
/// `mode` is `"move"` (relocate) or `"copy"` (keep Waxlight working). Only
/// directories listed in the Waxlight database are accepted, and folder name
/// collisions import under a suffixed name.
#[command]
pub async fn import_waxlight_instances(
    app: AppHandle,
    paths: Vec<String>,
    mode: String,
) -> Result<LegacyMigrationReport, UiError> {
    if mode != "move" && mode != "copy" {
        return Err(UiError::new(
            "invalid_mode",
            "Import mode must be \"move\" or \"copy\"",
        ));
    }
    let handle = app.clone();
    tokio::task::spawn_blocking(move || import_blocking(&handle, paths, &mode))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}

fn import_blocking(
    app: &AppHandle,
    requested: Vec<String>,
    mode: &str,
) -> Result<LegacyMigrationReport, UiError> {
    let Some(home) = waxlight_home() else {
        return Err(UiError::not_found("Waxlight data folder not found"));
    };
    let root = data_root(&home);
    if !root.join(DB_FILE).is_file() {
        return Err(UiError::not_found("Waxlight database not found"));
    }
    let rows = read_rows(&root)?;

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
        let Some(row) = rows
            .iter()
            .find(|row| normalize_path(&row.directory) == requested_normalized)
        else {
            report.skipped.push(LegacyMigrationSkip {
                name: requested_path,
                reason: "not listed in the Waxlight database".into(),
            });
            continue;
        };

        let source = row.directory.clone();
        let folder = dir_name(&source);
        let name = if row.name.trim().is_empty() {
            folder.clone()
        } else {
            row.name.clone()
        };

        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "folder no longer exists".into(),
            });
            continue;
        }
        if folder.is_empty() || folder.starts_with('.') {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "invalid folder name".into(),
            });
            continue;
        }
        if normalize_path(&source).starts_with(normalize_path(&profiles_root)) {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "already inside the profiles folder".into(),
            });
            continue;
        }
        if is_external_profile_dir(app, &source) {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: "already linked as a profile".into(),
            });
            continue;
        }

        let target = if mode == "move" {
            let target = free_profile_dir(&profiles_root, &folder);
            require_managed_path(app, &target, "profile")?;
            if super::utils::move_folder(source.clone(), target.clone()).is_err()
                || !target.is_dir()
            {
                report.skipped.push(LegacyMigrationSkip {
                    name,
                    reason: "failed to move the folder".into(),
                });
                continue;
            }
            target
        } else {
            match copy_profile_dir(&profiles_root, &source, &folder) {
                Ok(target) => target,
                Err(e) => {
                    report.skipped.push(LegacyMigrationSkip {
                        name,
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        let mut info = read_profile_json(&target).unwrap_or_else(|_| ProfileInfo {
            name: name.clone(),
            ..Default::default()
        });
        info.name = name.clone();
        info.version = row.version.clone();
        info.start_params = args_to_command(&row.launch_arguments);
        info.env_vars = row.environment_variables.clone();
        info.favorite = row.pinned;
        info.last_played = row.last_played;
        info.total_time_played = row.total_seconds;

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name,
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }

        log_info!("waxlight: imported {} ({})", info.name, mode);
        log.migrations.push(WaxlightMigrationEntry {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_timestamps() {
        assert_eq!(parse_rfc3339_millis("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_rfc3339_millis("2025-05-01T12:34:56Z"),
            Some(1_746_102_896_000)
        );
        assert_eq!(
            parse_rfc3339_millis("2025-05-01T12:34:56.789Z"),
            Some(1_746_102_896_789)
        );
        // Offset is applied: 14:34:56+02:00 equals 12:34:56Z.
        assert_eq!(
            parse_rfc3339_millis("2025-05-01T14:34:56+02:00"),
            Some(1_746_102_896_000)
        );
        assert_eq!(parse_rfc3339_millis("not a timestamp"), None);
        assert_eq!(parse_rfc3339_millis(""), None);
    }

    #[test]
    fn quotes_launch_arguments() {
        assert_eq!(
            args_to_command(&["--foo".into(), "bar baz".into(), "a'b".into(), "".into()]),
            "--foo 'bar baz' 'a'\\''b' ''"
        );
    }

    #[test]
    fn reads_instances_from_a_sqlite_database() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE game_versions (id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE instances (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, game_client TEXT NOT NULL DEFAULT 'vanilla',
                game_version_id TEXT NOT NULL DEFAULT '', directory TEXT NOT NULL,
                launch_arguments TEXT NOT NULL DEFAULT '[]',
                environment_variables TEXT NOT NULL DEFAULT '{}', is_pinned INTEGER NOT NULL DEFAULT 0,
                last_played_at TEXT
            );
            CREATE TABLE play_sessions (
                id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, duration_sec INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO game_versions (id, name) VALUES ('v1', '1.21.3');
            INSERT INTO instances (id, name, game_version_id, directory, launch_arguments, environment_variables, is_pinned, last_played_at)
            VALUES ('i1', 'My World', 'v1', 'instances/my-world', '["--foo","bar baz"]', '{"A":"1"}', 1, '2025-05-01T12:34:56.789Z');
            INSERT INTO play_sessions (id, instance_id, duration_sec) VALUES ('s1', 'i1', 120);
            INSERT INTO play_sessions (id, instance_id, duration_sec) VALUES ('s2', 'i1', 60);
            "#,
        )
        .unwrap();

        let rows = read_rows_from_connection(&conn, Path::new("/data/waxlight")).unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row.name, "My World");
        assert_eq!(row.version, "1.21.3");
        // Relative directories resolve against the data root.
        assert_eq!(
            row.directory,
            PathBuf::from("/data/waxlight/instances/my-world")
        );
        assert_eq!(row.launch_arguments, vec!["--foo", "bar baz"]);
        assert_eq!(
            row.environment_variables.get("A").map(String::as_str),
            Some("1")
        );
        assert!(row.pinned);
        assert_eq!(row.last_played, Some(1_746_102_896_789));
        assert_eq!(row.total_seconds, 180);
    }

    #[test]
    fn tolerates_older_schemas_without_optional_columns() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE instances (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, directory TEXT NOT NULL
            );
            INSERT INTO instances (id, name, directory) VALUES ('i1', 'Old', '/abs/old');
            "#,
        )
        .unwrap();

        let rows = read_rows_from_connection(&conn, Path::new("/data/waxlight")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].directory, PathBuf::from("/abs/old"));
        assert!(rows[0].launch_arguments.is_empty());
        assert!(rows[0].environment_variables.is_empty());
        assert!(!rows[0].pinned);
        assert_eq!(rows[0].last_played, None);
        assert_eq!(rows[0].total_seconds, 0);
    }

    #[test]
    fn reads_game_versions_from_the_database() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE game_versions (id TEXT PRIMARY KEY, name TEXT NOT NULL, installation_dir TEXT NOT NULL);
            INSERT INTO game_versions (id, name, installation_dir) VALUES ('v1', '1.21.3', 'versions/1.21.3');
            INSERT INTO game_versions (id, name, installation_dir) VALUES ('v2', '1.20.4', '/abs/1.20.4');
            "#,
        )
        .unwrap();

        let versions = game_versions_from_connection(&conn, Path::new("/data/waxlight"));
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].0, "1.21.3");
        assert_eq!(
            versions[0].1,
            PathBuf::from("/data/waxlight/versions/1.21.3")
        );
        assert_eq!(versions[1].1, PathBuf::from("/abs/1.20.4"));
    }

    #[test]
    fn data_root_pointer_wins_over_home() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let root = dir.path().join("moved");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&root).unwrap();

        assert_eq!(data_root(&home), home);
        std::fs::write(
            home.join(DATA_ROOT_POINTER),
            root.to_string_lossy().as_bytes(),
        )
        .unwrap();
        assert_eq!(data_root(&home), root);
        // A stale pointer falls back to the home directory.
        std::fs::write(home.join(DATA_ROOT_POINTER), "/does/not/exist").unwrap();
        assert_eq!(data_root(&home), home);
    }
}
