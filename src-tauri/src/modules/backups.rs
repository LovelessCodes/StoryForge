//! Profile backups: timestamped zip snapshots of a profile's data directory.
//!
//! Backups live under `<app data>/backups/<profile id>/`. A backup captures
//! everything in the profile folder except `Logs/` — worlds, mods, mod
//! configs and client settings — so a bad update or mod install can be rolled
//! back in one click. The game must not be running while backing up or
//! restoring.

use std::collections::HashSet;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, Instant, UNIX_EPOCH};

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::errors::UiError;
use super::profiles::{find_profile_by_id, is_profile_running};
use super::utils::{format_size, lock};

/// Top-level profile folders that are skipped: logs are disposable and can be
/// large.
const EXCLUDED_DIRS: &[&str] = &["Logs"];

/// Clamp for the per-profile retention setting.
pub const MAX_BACKUP_LIMIT: u32 = 50;

/// Subdirectory of the app data dir that holds every profile's backups.
const BACKUPS_SUBDIR: &str = "backups";

/// Zip files that are already compressed are stored as-is; everything else
/// gets deflated.
const STORED_EXTENSIONS: &[&str] = &["zip"];

/// Emit progress at most this often while zipping/extracting.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

/// Profiles with a backup or restore in flight; two jobs must not write the
/// same directory at once.
static BACKUP_BUSY: LazyLock<std::sync::Mutex<HashSet<u64>>> = LazyLock::new(Default::default);

#[derive(Debug, Clone, Serialize)]
pub struct ProfileBackup {
    /// File name without the `.zip` extension; the restore/delete handle.
    pub id: String,
    /// Creation time in milliseconds since the UNIX epoch.
    pub created_at: u64,
    pub size_bytes: u64,
    pub size_display: String,
}

/// Called with `(done, total)` after an archive entry is processed.
type Progress<'a> = &'a mut dyn FnMut(u64, u64);

/// Holds the busy flag for a profile until the job finishes (or panics).
struct BusyGuard(u64);

impl BusyGuard {
    fn acquire(profile_id: u64) -> Result<Self, UiError> {
        if !lock(&BACKUP_BUSY).insert(profile_id) {
            return Err(UiError::new(
                "backup_busy",
                "Another backup or restore is already running for this profile.",
            ));
        }
        Ok(Self(profile_id))
    }
}

impl Drop for BusyGuard {
    fn drop(&mut self) {
        lock(&BACKUP_BUSY).remove(&self.0);
    }
}

// ── Paths and names ──

fn backups_root(app: &AppHandle, profile_id: u64) -> Result<PathBuf, UiError> {
    let app_data = app.path().app_data_dir().map_err(|e| {
        UiError::new(
            "app_data_failed",
            format!("Failed to get app data dir: {e}"),
        )
    })?;
    Ok(app_data.join(BACKUPS_SUBDIR).join(profile_id.to_string()))
}

/// Backup ids are file names, so they must not be able to escape the backups
/// directory.
fn is_valid_backup_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Picks `base`, `base-2`, `base-3`… until a free file name is found.
fn unique_id(backups_dir: &Path, base: &str) -> String {
    let mut id = base.to_string();
    let mut suffix = 2;
    while backups_dir.join(format!("{id}.zip")).exists() {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    id
}

/// Formats a UNIX timestamp (seconds) as `YYYY-MM-DD_HH-MM-SS` in UTC.
fn format_timestamp(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}_{hour:02}-{minute:02}-{second:02}",
        hour = rem / 3600,
        minute = (rem % 3600) / 60,
        second = rem % 60
    )
}

/// Howard Hinnant's `civil_from_days` (days since 1970-01-01 → y/m/d).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ── Core operations (AppHandle-free so they can be unit tested) ──

/// True when `path` sits inside a top-level folder that is excluded.
fn is_excluded(profile_dir: &Path, path: &Path) -> bool {
    if path == profile_dir {
        return false;
    }
    match path.strip_prefix(profile_dir) {
        Ok(relative) => relative
            .components()
            .next()
            .map(|component| {
                let name = component.as_os_str().to_string_lossy();
                EXCLUDED_DIRS
                    .iter()
                    .any(|excluded| excluded.eq_ignore_ascii_case(&name))
            })
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn file_options(path: &Path) -> SimpleFileOptions {
    let already_compressed = path
        .extension()
        .map(|ext| {
            STORED_EXTENSIONS
                .iter()
                .any(|known| known.eq_ignore_ascii_case(&ext.to_string_lossy()))
        })
        .unwrap_or(false);
    SimpleFileOptions::default().compression_method(if already_compressed {
        CompressionMethod::Stored
    } else {
        CompressionMethod::Deflated
    })
}

/// Zips `profile_dir` into `backups_dir/<id>.zip` and returns its metadata.
fn backup_profile(
    backups_dir: &Path,
    profile_dir: &Path,
    now_secs: i64,
    on_progress: Progress,
) -> Result<ProfileBackup, UiError> {
    fs::create_dir_all(backups_dir).map_err(|e| {
        UiError::new(
            "backup_failed",
            format!("Failed to create backups directory: {e}"),
        )
    })?;

    let id = unique_id(backups_dir, &format_timestamp(now_secs));
    let target = backups_dir.join(format!("{id}.zip"));
    let partial = backups_dir.join(format!("{id}.zip.part"));

    let files: Vec<PathBuf> = WalkDir::new(profile_dir)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !is_excluded(profile_dir, entry.path()))
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .collect();
    let total = files.len() as u64;

    let result = (|| -> Result<(), UiError> {
        let file = File::create(&partial).map_err(|e| {
            UiError::new(
                "backup_failed",
                format!("Failed to create backup file: {e}"),
            )
        })?;
        let mut writer = ZipWriter::new(file);

        for (index, path) in files.iter().enumerate() {
            let relative = path.strip_prefix(profile_dir).map_err(|e| {
                UiError::new(
                    "backup_failed",
                    format!("Failed to read a profile file: {e}"),
                )
            })?;
            // Zip entries always use forward slashes, even on Windows.
            let name = relative.to_string_lossy().replace('\\', "/");
            writer.start_file(&name, file_options(path)).map_err(|e| {
                UiError::new("backup_failed", format!("Failed to write zip entry: {e}"))
            })?;
            let mut source = File::open(path).map_err(|e| {
                UiError::new(
                    "backup_failed",
                    format!("Failed to open a profile file: {e}"),
                )
            })?;
            std::io::copy(&mut source, &mut writer).map_err(|e| {
                UiError::new(
                    "backup_failed",
                    format!("Failed to copy a profile file: {e}"),
                )
            })?;
            on_progress(index as u64 + 1, total);
        }

        writer.finish().map_err(|e| {
            UiError::new(
                "backup_failed",
                format!("Failed to finalize the backup: {e}"),
            )
        })?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&partial);
        return Err(error);
    }

    fs::rename(&partial, &target).map_err(|e| {
        let _ = fs::remove_file(&partial);
        UiError::new("backup_failed", format!("Failed to save the backup: {e}"))
    })?;

    let size_bytes = fs::metadata(&target).map(|meta| meta.len()).unwrap_or(0);
    Ok(ProfileBackup {
        id,
        created_at: now_secs.max(0) as u64 * 1000,
        size_bytes,
        size_display: format_size(size_bytes),
    })
}

/// Extracts a backup over the profile directory. Files added after the backup
/// are kept; everything the archive holds is overwritten.
fn restore_profile(
    backups_dir: &Path,
    profile_dir: &Path,
    id: &str,
    on_progress: Progress,
) -> Result<(), UiError> {
    if !is_valid_backup_id(id) {
        return Err(UiError::new("invalid_args", "Invalid backup id."));
    }
    let archive_path = backups_dir.join(format!("{id}.zip"));
    if !archive_path.is_file() {
        return Err(UiError::not_found(format!(
            "Backup {id} not found for this profile."
        )));
    }

    let file = File::open(&archive_path)
        .map_err(|e| UiError::new("restore_failed", format!("Failed to open the backup: {e}")))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| UiError::new("restore_failed", format!("Failed to read the backup: {e}")))?;
    let total = archive.len() as u64;

    fs::create_dir_all(profile_dir).map_err(|e| {
        UiError::new(
            "restore_failed",
            format!("Failed to create the profile folder: {e}"),
        )
    })?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| {
            UiError::new(
                "restore_failed",
                format!("Failed to read a backup entry: {e}"),
            )
        })?;
        // `enclosed_name` rejects absolute paths and `..` escapes.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let target = profile_dir.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| {
                UiError::new("restore_failed", format!("Failed to create a folder: {e}"))
            })?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    UiError::new("restore_failed", format!("Failed to create a folder: {e}"))
                })?;
            }
            let mut writer = File::create(&target).map_err(|e| {
                UiError::new(
                    "restore_failed",
                    format!("Failed to write a profile file: {e}"),
                )
            })?;
            std::io::copy(&mut entry, &mut writer).map_err(|e| {
                UiError::new(
                    "restore_failed",
                    format!("Failed to extract a profile file: {e}"),
                )
            })?;
        }
        on_progress(index as u64 + 1, total);
    }

    Ok(())
}

/// Lists backups newest first.
fn list_backups(backups_dir: &Path) -> Result<Vec<ProfileBackup>, UiError> {
    if !backups_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut backups = Vec::new();
    for entry in fs::read_dir(backups_dir).map_err(|e| {
        UiError::new(
            "io_error",
            format!("Failed to read the backups folder: {e}"),
        )
    })? {
        let path = entry
            .map_err(|e| UiError::new("io_error", format!("Failed to read a backup entry: {e}")))?
            .path();
        if path
            .extension()
            .map(|ext| !ext.eq_ignore_ascii_case("zip"))
            .unwrap_or(true)
        {
            continue;
        }
        let Some(id) = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
        else {
            continue;
        };
        if !is_valid_backup_id(&id) {
            continue;
        }
        let metadata = fs::metadata(&path)
            .map_err(|e| UiError::new("io_error", format!("Failed to read a backup: {e}")))?;
        let created_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        let size_bytes = metadata.len();
        backups.push(ProfileBackup {
            id,
            created_at,
            size_bytes,
            size_display: format_size(size_bytes),
        });
    }
    // Ids are timestamps, so a descending name sort is a descending time sort.
    backups.sort_by(|a, b| b.id.cmp(&a.id));
    Ok(backups)
}

/// Deletes the oldest backups until at most `keep` remain.
fn prune_backups(backups_dir: &Path, keep: usize) -> Result<Vec<String>, UiError> {
    let mut backups = list_backups(backups_dir)?;
    let mut removed = Vec::new();
    // `list_backups` is newest first.
    while backups.len() > keep {
        let oldest = backups.pop().expect("len checked above");
        fs::remove_file(backups_dir.join(format!("{}.zip", oldest.id))).map_err(|e| {
            UiError::new(
                "delete_failed",
                format!("Failed to delete old backup {}: {e}", oldest.id),
            )
        })?;
        removed.push(oldest.id);
    }
    Ok(removed)
}

// ── AppHandle-facing operations ──

/// Creates a backup, emitting `backup-<profile id>` progress events.
pub fn run_backup(app: &AppHandle, profile_id: u64) -> Result<ProfileBackup, UiError> {
    let _guard = BusyGuard::acquire(profile_id)?;
    if is_profile_running(profile_id) {
        return Err(UiError::new(
            "profile_running",
            "Stop the game before backing up this profile.",
        ));
    }
    let (profile_dir, profile) = find_profile_by_id(app, profile_id)?;
    let backups_dir = backups_root(app, profile_id)?;
    let event = format!("backup-{profile_id}");

    let mut last_emit = Instant::now();
    let mut on_progress = |done: u64, total: u64| {
        let finished = done >= total;
        if finished || last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                &event,
                json!({ "phase": "backing-up", "current": done, "total": total }),
            );
        }
    };

    match backup_profile(&backups_dir, &profile_dir, unix_secs(), &mut on_progress) {
        Ok(backup) => {
            if profile.backup_limit > 0 {
                if let Err(error) = prune_backups(&backups_dir, profile.backup_limit as usize) {
                    // Retention is housekeeping; a failure must not fail the backup.
                    crate::log_error!("backups: prune failed: {}", error.message);
                }
            }
            let _ = app.emit(&event, json!({ "phase": "done", "backup": backup }));
            Ok(backup)
        }
        Err(error) => {
            let _ = app.emit(
                &event,
                json!({ "phase": "error", "message": error.message }),
            );
            Err(error)
        }
    }
}

/// Restores a backup over its profile, emitting progress events.
fn run_restore(app: &AppHandle, profile_id: u64, backup_id: &str) -> Result<(), UiError> {
    let _guard = BusyGuard::acquire(profile_id)?;
    if is_profile_running(profile_id) {
        return Err(UiError::new(
            "profile_running",
            "Stop the game before restoring a backup.",
        ));
    }
    let (profile_dir, _) = find_profile_by_id(app, profile_id)?;
    let backups_dir = backups_root(app, profile_id)?;
    let event = format!("backup-{profile_id}");

    let mut last_emit = Instant::now();
    let mut on_progress = |done: u64, total: u64| {
        let finished = done >= total;
        if finished || last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                &event,
                json!({ "phase": "restoring", "current": done, "total": total }),
            );
        }
    };

    match restore_profile(&backups_dir, &profile_dir, backup_id, &mut on_progress) {
        Ok(()) => {
            let _ = app.emit(&event, json!({ "phase": "done" }));
            Ok(())
        }
        Err(error) => {
            let _ = app.emit(
                &event,
                json!({ "phase": "error", "message": error.message }),
            );
            Err(error)
        }
    }
}

// ── Commands ──

#[tauri::command]
pub fn list_profile_backups(
    app: AppHandle,
    profile_id: u64,
) -> Result<Vec<ProfileBackup>, UiError> {
    // Resolve first so backups cannot be listed for unknown profiles.
    let _ = find_profile_by_id(&app, profile_id)?;
    list_backups(&backups_root(&app, profile_id)?)
}

/// Zipping a whole profile is blocking work: keep it off the UI thread.
#[tauri::command(async)]
pub fn create_profile_backup(app: AppHandle, profile_id: u64) -> Result<ProfileBackup, UiError> {
    run_backup(&app, profile_id)
}

#[tauri::command(async)]
pub fn restore_profile_backup(
    app: AppHandle,
    profile_id: u64,
    backup_id: String,
) -> Result<(), UiError> {
    run_restore(&app, profile_id, &backup_id)
}

#[tauri::command]
pub fn delete_profile_backup(
    app: AppHandle,
    profile_id: u64,
    backup_id: String,
) -> Result<(), UiError> {
    if !is_valid_backup_id(&backup_id) {
        return Err(UiError::new("invalid_args", "Invalid backup id."));
    }
    let _ = find_profile_by_id(&app, profile_id)?;
    let backups_dir = backups_root(&app, profile_id)?;
    let target = backups_dir.join(format!("{backup_id}.zip"));
    if !target.is_file() {
        return Err(UiError::not_found(format!("Backup {backup_id} not found.")));
    }
    fs::remove_file(&target)
        .map_err(|e| UiError::new("delete_failed", format!("Failed to delete the backup: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_utc_timestamps() {
        assert_eq!(format_timestamp(0), "1970-01-01_00-00-00");
        assert_eq!(format_timestamp(1_704_164_645), "2024-01-02_03-04-05");
        // End of a leap day.
        assert_eq!(format_timestamp(1_709_251_199), "2024-02-29_23-59-59");
    }

    #[test]
    fn rejects_traversal_ids() {
        assert!(is_valid_backup_id("2026-10-05_10-30-00"));
        assert!(!is_valid_backup_id("../evil"));
        assert!(!is_valid_backup_id("a/b"));
        assert!(!is_valid_backup_id(""));
    }

    #[test]
    fn backup_roundtrip_restores_files_and_skips_logs() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        let backups = tmp.path().join("backups");
        fs::create_dir_all(profile.join("Saves/World 1")).unwrap();
        fs::create_dir_all(profile.join("Logs")).unwrap();
        fs::write(profile.join("Saves/World 1/world.dat"), b"version one").unwrap();
        fs::write(profile.join("clientsettings.json"), b"{\"a\":1}").unwrap();
        fs::write(profile.join("Logs/session.log"), b"noisy").unwrap();

        let backup = backup_profile(&backups, &profile, 1_704_164_645, &mut |_, _| {}).unwrap();
        assert_eq!(backup.id, "2024-01-02_03-04-05");

        // Logs are never part of a backup.
        let file = File::open(backups.join(format!("{}.zip", backup.id))).unwrap();
        let names: Vec<String> = ZipArchive::new(file)
            .unwrap()
            .file_names()
            .map(str::to_string)
            .collect();
        assert!(names.iter().any(|name| name == "Saves/World 1/world.dat"));
        assert!(!names.iter().any(|name| name.starts_with("Logs/")));

        // Touch the world, then roll back.
        fs::write(profile.join("Saves/World 1/world.dat"), b"version two").unwrap();
        assert!(restore_profile(&backups, &profile, &backup.id, &mut |_, _| {}).is_ok());
        assert_eq!(
            fs::read(profile.join("Saves/World 1/world.dat")).unwrap(),
            b"version one"
        );
        // Files created after the backup are kept.
        fs::write(profile.join("Saves/new-world.dat"), b"new").unwrap();
        assert!(restore_profile(&backups, &profile, &backup.id, &mut |_, _| {}).is_ok());
        assert!(profile.join("Saves/new-world.dat").is_file());
        // The log survives on disk even though it is not in the archive.
        assert!(profile.join("Logs/session.log").is_file());
    }

    #[test]
    fn prunes_oldest_backups_first() {
        let tmp = tempfile::tempdir().unwrap();
        let backups = tmp.path().join("backups");
        fs::create_dir_all(&backups).unwrap();
        for stamp in [
            "2024-01-01_00-00-00",
            "2024-02-01_00-00-00",
            "2024-03-01_00-00-00",
        ] {
            fs::write(backups.join(format!("{stamp}.zip")), b"x").unwrap();
        }
        // A stray file must not count or be deleted.
        fs::write(backups.join("notes.txt"), b"x").unwrap();

        let removed = prune_backups(&backups, 2).unwrap();
        assert_eq!(removed, vec!["2024-01-01_00-00-00"]);
        let left = list_backups(&backups).unwrap();
        assert_eq!(left.len(), 2);
        assert_eq!(left[0].id, "2024-03-01_00-00-00");
        assert!(backups.join("notes.txt").is_file());
    }

    #[test]
    fn unique_ids_do_not_overwrite_same_second_backups() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("file.txt"), b"x").unwrap();

        let first = backup_profile(&tmp.path().join("b"), &profile, 1_000, &mut |_, _| {}).unwrap();
        let second =
            backup_profile(&tmp.path().join("b"), &profile, 1_000, &mut |_, _| {}).unwrap();
        assert_eq!(first.id, "1970-01-01_00-16-40");
        assert_eq!(second.id, "1970-01-01_00-16-40-2");
    }
}
