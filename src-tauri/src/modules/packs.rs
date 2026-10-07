//! Story Forge packs: a lockfile that pins a profile's mods to exact versions
//! and SHA-256 hashes, plus drift detection and a sync/repair pass.
//!
//! The lock lives beside `profile.json` as `storyforge.lock.json`, so it
//! travels with the profile folder, survives `profile.json` rewrites, and can
//! be diffed like any other file. It records one row per installed mod zip:
//! modid, exact version, file name and the SHA-256 of the zip bytes. Rows are
//! written from what is actually on disk ("pin current state") rather than
//! from a remote catalog, so a lock can be created for any profile.
//!
//! Syncing is explicit, never on launch. `apply_profile_lock` downloads every
//! missing or mismatched mod through ModDB (modid + version), verifies the
//! download against the locked hash, and removes the superseded file it
//! replaces. Mods the lock does not name are reported as extras and left
//! alone.

use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{command, AppHandle, Emitter, State};

use super::errors::UiError;
use super::{mods, paths, profiles};
use crate::{log_error, log_info};

/// File name of the lock inside a profile folder.
pub const LOCK_FILE: &str = "storyforge.lock.json";
const LOCK_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackLock {
    pub lock_version: u32,
    #[serde(default)]
    pub modpack_slug: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
    #[serde(default)]
    pub created_at: u64,
    pub mods: Vec<LockedMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedMod {
    pub modid: String,
    pub version: String,
    #[serde(default)]
    pub filename: Option<String>,
    /// Lowercase hex, no `sha256:` prefix.
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedModStatus {
    pub modid: String,
    pub version: String,
    /// `ok` | `missing` | `version-mismatch` | `hash-mismatch`
    pub state: String,
    pub installed_version: Option<String>,
    pub installed_filename: Option<String>,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraMod {
    pub modid: String,
    pub version: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileLockStatus {
    pub lock: PackLock,
    pub entries: Vec<LockedModStatus>,
    pub extras: Vec<ExtraMod>,
    pub in_sync: u32,
    pub missing: u32,
    pub mismatched: u32,
    pub extra_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFailure {
    pub modid: String,
    pub version: String,
    /// UiError name, or `hash-mismatch` when the download did not match the lock.
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub applied: Vec<String>,
    pub removed: Vec<String>,
    pub failed: Vec<SyncFailure>,
}

// ── Paths and hashing ───────────────────────────────────────────────────────

pub(crate) fn lock_path(profile_dir: &Path) -> PathBuf {
    profile_dir.join(LOCK_FILE)
}

/// Streams a file through SHA-256 so a large zip is never held in memory.
pub(crate) fn sha256_file(path: &Path) -> Result<String, UiError> {
    let mut file = File::open(path)
        .map_err(|error| UiError::io(format!("Failed to open {}: {error}", path.display())))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| UiError::io(format!("Failed to read {}: {error}", path.display())))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn file_name_of(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
}

// ── Lock read/write/build ───────────────────────────────────────────────────

pub(crate) fn read_lock(profile_dir: &Path) -> Result<Option<PackLock>, UiError> {
    let path = lock_path(profile_dir);
    if !path.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path)
        .map_err(|error| UiError::io(format!("Failed to read {}: {error}", path.display())))?;
    let lock: PackLock = serde_json::from_str(&text)
        .map_err(|error| UiError::new("parse_error", format!("Invalid lockfile: {error}")))?;
    if lock.lock_version != LOCK_VERSION {
        return Err(UiError::new(
            "unsupported_lock",
            format!("Unsupported lockfile version {}", lock.lock_version),
        ));
    }
    Ok(Some(lock))
}

pub(crate) fn write_lock(profile_dir: &Path, lock: &PackLock) -> Result<(), UiError> {
    let text = serde_json::to_string_pretty(lock).map_err(|error| {
        UiError::new("serialize_failed", format!("Failed to serialize: {error}"))
    })?;
    fs::write(lock_path(profile_dir), text)
        .map_err(|error| UiError::io(format!("Failed to write lockfile: {error}")))
}

/// The zips currently installed in a profile's `Mods` directory.
fn installed_mods(profile_dir: &Path) -> Vec<mods::OutputMod> {
    let dir = paths::mods_dir(profile_dir);
    if !dir.is_dir() {
        return Vec::new();
    }
    match mods::get_mods_in_dir(&dir) {
        Ok(result) => result.mods,
        Err(error) => {
            log_error!("packs: failed to scan mods: {}", error.message);
            Vec::new()
        }
    }
}

/// Pins the profile's current mods as a lock.
pub(crate) fn build_lock(
    profile_dir: &Path,
    info: &profiles::ProfileInfo,
) -> Result<PackLock, UiError> {
    let mut entries: Vec<LockedMod> = Vec::new();
    for installed in installed_mods(profile_dir) {
        let path = PathBuf::from(&installed.path);
        let sha256 = sha256_file(&path)?;
        entries.push(LockedMod {
            modid: installed.modid,
            version: installed.version,
            filename: file_name_of(&path),
            sha256,
        });
    }
    entries.sort_by(|a, b| {
        a.modid
            .cmp(&b.modid)
            .then_with(|| a.version.cmp(&b.version))
    });
    Ok(PackLock {
        lock_version: LOCK_VERSION,
        modpack_slug: info.modpack_slug.clone(),
        modpack_version: info.modpack_version.clone(),
        created_at: now_ms(),
        mods: entries,
    })
}

// ── Drift status ────────────────────────────────────────────────────────────

/// Compares the lock with what is on disk.
///
/// A locked row is `ok` when some installed zip of the same modid hashes to
/// the locked SHA-256, `hash-mismatch` when the version matches but the bytes
/// do not, `version-mismatch` when another version of the mod is installed,
/// and `missing` when the mod is not installed at all. Installed mods the lock
/// does not name are extras.
pub(crate) fn compute_status(
    profile_dir: &Path,
    lock: &PackLock,
) -> Result<ProfileLockStatus, UiError> {
    let installed = installed_mods(profile_dir);
    let mut used = vec![false; installed.len()];
    let mut entries = Vec::with_capacity(lock.mods.len());

    for locked in &lock.mods {
        let candidates: Vec<usize> = installed
            .iter()
            .enumerate()
            .filter(|(index, installed)| {
                !used[*index] && installed.modid.eq_ignore_ascii_case(&locked.modid)
            })
            .map(|(index, _)| index)
            .collect();

        let mut state = "missing";
        let mut installed_version = None;
        let mut installed_filename = None;

        if !candidates.is_empty() {
            let hash_match = candidates.iter().copied().find(|index| {
                sha256_file(Path::new(&installed[*index].path))
                    .map(|digest| digest.eq_ignore_ascii_case(&locked.sha256))
                    .unwrap_or(false)
            });
            let chosen = hash_match
                .or_else(|| {
                    candidates
                        .iter()
                        .copied()
                        .find(|index| installed[*index].version == locked.version)
                })
                .unwrap_or(candidates[0]);
            used[chosen] = true;
            installed_version = Some(installed[chosen].version.clone());
            installed_filename = file_name_of(Path::new(&installed[chosen].path));
            state = if hash_match.is_some() {
                "ok"
            } else if installed[chosen].version == locked.version {
                "hash-mismatch"
            } else {
                "version-mismatch"
            };
        }

        entries.push(LockedModStatus {
            modid: locked.modid.clone(),
            version: locked.version.clone(),
            state: state.to_string(),
            installed_version,
            installed_filename,
            sha256: locked.sha256.clone(),
        });
    }

    let extras: Vec<ExtraMod> = installed
        .iter()
        .enumerate()
        .filter(|(index, _)| !used[*index])
        .map(|(_, installed)| ExtraMod {
            modid: installed.modid.clone(),
            version: installed.version.clone(),
            filename: file_name_of(Path::new(&installed.path)).unwrap_or_default(),
        })
        .collect();

    let in_sync = entries.iter().filter(|entry| entry.state == "ok").count() as u32;
    let missing = entries
        .iter()
        .filter(|entry| entry.state == "missing")
        .count() as u32;
    let mismatched = entries
        .iter()
        .filter(|entry| entry.state != "ok" && entry.state != "missing")
        .count() as u32;

    let extra_count = extras.len() as u32;
    Ok(ProfileLockStatus {
        lock: lock.clone(),
        entries,
        extras,
        in_sync,
        missing,
        mismatched,
        extra_count,
    })
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Pins the profile's current mods to a lockfile, replacing any existing lock.
#[command]
pub async fn create_profile_lock(app: AppHandle, id: u64) -> Result<PackLock, UiError> {
    log_info!("create_profile_lock: profile={id}");
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let (dir, info) = profiles::find_profile_by_id(&handle, id)?;
        let lock = build_lock(&dir, &info)?;
        write_lock(&dir, &lock)?;
        log_info!(
            "create_profile_lock: wrote {} mod(s) to {}",
            lock.mods.len(),
            lock_path(&dir).display()
        );
        Ok(lock)
    })
    .await
    .map_err(|error| UiError::new("internal_error", format!("Lock failed: {error}")))?
}

/// The lock and its drift, or `None` when the profile has no lock.
#[command]
pub async fn get_profile_lock_status(
    app: AppHandle,
    id: u64,
) -> Result<Option<ProfileLockStatus>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let (dir, _info) = profiles::find_profile_by_id(&handle, id)?;
        let Some(lock) = read_lock(&dir)? else {
            return Ok(None);
        };
        Ok(Some(compute_status(&dir, &lock)?))
    })
    .await
    .map_err(|error| UiError::new("internal_error", format!("Lock status failed: {error}")))?
}

/// Removes the lockfile; installed mods are untouched.
#[command]
pub async fn remove_profile_lock(app: AppHandle, id: u64) -> Result<(), UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let (dir, _info) = profiles::find_profile_by_id(&handle, id)?;
        let path = lock_path(&dir);
        if path.is_file() {
            fs::remove_file(&path)
                .map_err(|error| UiError::io(format!("Failed to remove lockfile: {error}")))?;
        }
        Ok(())
    })
    .await
    .map_err(|error| UiError::new("internal_error", format!("Remove lock failed: {error}")))?
}

/// Brings the profile back to the lock: downloads missing and mismatched mods
/// through ModDB, verifies each against the locked hash, and removes the file
/// a repaired mod supersedes. Extras are reported, never removed.
///
/// Emits `{ phase: "syncing", current, total, modid, version }` per mod and a
/// final `{ phase: "done", applied, failed }` on `emitevent`, when one is given.
#[command]
pub async fn apply_profile_lock(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    id: u64,
    emitevent: String,
) -> Result<SyncReport, UiError> {
    log_info!("apply_profile_lock: profile={id}");
    let (dir, _info) = profiles::find_profile_by_id(&app, id)?;
    let Some(lock) = read_lock(&dir)? else {
        return Err(UiError::not_found("This profile has no lockfile"));
    };
    sync_locked_profile(&app, &client, &dir, &lock, Some(&emitevent)).await
}

/// The sync pass itself, shared by the command and by pack imports.
pub(crate) async fn sync_locked_profile(
    app: &AppHandle,
    client: &reqwest::Client,
    dir: &Path,
    lock: &PackLock,
    emitevent: Option<&str>,
) -> Result<SyncReport, UiError> {
    let status = compute_status(dir, lock)?;
    let pending: Vec<LockedModStatus> = status
        .entries
        .iter()
        .filter(|entry| entry.state != "ok")
        .cloned()
        .collect();
    let total = pending.len();
    let mods_dir = paths::mods_dir(dir);
    let mut report = SyncReport {
        applied: Vec::new(),
        removed: Vec::new(),
        failed: Vec::new(),
    };

    for (index, entry) in pending.iter().enumerate() {
        if let Some(event) = emitevent {
            let _ = app.emit(
                event,
                json!({
                    "phase": "syncing",
                    "current": index + 1,
                    "total": total,
                    "modid": entry.modid,
                    "version": entry.version,
                }),
            );
        }

        match mods::download_mod_file(client, &entry.modid, &entry.version, &mods_dir).await {
            Ok(filename) => {
                let downloaded = mods_dir.join(&filename);
                let digest = sha256_file(&downloaded)?;
                if !digest.eq_ignore_ascii_case(&entry.sha256) {
                    log_error!(
                        "apply_profile_lock: {}@{} did not match the locked hash",
                        entry.modid,
                        entry.version
                    );
                    let _ = fs::remove_file(&downloaded);
                    report.failed.push(SyncFailure {
                        modid: entry.modid.clone(),
                        version: entry.version.clone(),
                        reason: "hash-mismatch".to_string(),
                    });
                    continue;
                }
                // The repaired mod supersedes the file that was there before.
                if let Some(previous) = &entry.installed_filename {
                    if previous != &filename {
                        let previous_path = mods_dir.join(previous);
                        if previous_path.is_file() {
                            let _ = fs::remove_file(&previous_path);
                            report.removed.push(previous.clone());
                        }
                    }
                }
                report.applied.push(entry.modid.clone());
            }
            Err(error) => {
                log_error!(
                    "apply_profile_lock: failed to fetch {}@{}: {}",
                    entry.modid,
                    entry.version,
                    error.message
                );
                report.failed.push(SyncFailure {
                    modid: entry.modid.clone(),
                    version: entry.version.clone(),
                    reason: error.name,
                });
            }
        }
    }

    mods::invalidate_mods_cache(&mods_dir);
    if let Some(event) = emitevent {
        let _ = app.emit(
            event,
            json!({
                "phase": "done",
                "applied": report.applied.len(),
                "failed": report.failed.len(),
            }),
        );
    }
    log_info!(
        "apply_profile_lock: applied {} removed {} failed {}",
        report.applied.len(),
        report.removed.len(),
        report.failed.len()
    );
    Ok(report)
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn write_mod_zip(path: &Path, modid: &str, version: &str) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        writer
            .start_file("modinfo.json", SimpleFileOptions::default())
            .unwrap();
        let info = json!({
            "modid": modid,
            "name": format!("Mod {modid}"),
            "version": version,
            "type": "code",
            "side": "universal",
        });
        writer.write_all(info.to_string().as_bytes()).unwrap();
        writer.finish().unwrap();
    }

    fn profile_with_mods(entries: &[(&str, &str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let mods_dir = paths::mods_dir(dir.path());
        fs::create_dir_all(&mods_dir).unwrap();
        for (filename, modid, version) in entries {
            write_mod_zip(&mods_dir.join(filename), modid, version);
        }
        dir
    }

    fn info(modpack_slug: Option<&str>, modpack_version: Option<&str>) -> profiles::ProfileInfo {
        profiles::ProfileInfo {
            modpack_slug: modpack_slug.map(str::to_string),
            modpack_version: modpack_version.map(str::to_string),
            ..Default::default()
        }
    }

    #[test]
    fn lock_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let lock = PackLock {
            lock_version: LOCK_VERSION,
            modpack_slug: Some("anego".into()),
            modpack_version: Some("1.2.0".into()),
            created_at: 7,
            mods: vec![LockedMod {
                modid: "carryon".into(),
                version: "1.13.0".into(),
                filename: Some("carryon_1.13.0.zip".into()),
                sha256: "a".repeat(64),
            }],
        };
        write_lock(dir.path(), &lock).unwrap();
        let read = read_lock(dir.path()).unwrap().unwrap();
        assert_eq!(read.mods.len(), 1);
        assert_eq!(read.mods[0].modid, "carryon");
        assert_eq!(read.modpack_slug.as_deref(), Some("anego"));

        fs::remove_file(lock_path(dir.path())).unwrap();
        assert!(read_lock(dir.path()).unwrap().is_none());
    }

    #[test]
    fn build_lock_pins_installed_mods() {
        let dir = profile_with_mods(&[
            ("carryon_1.13.0.zip", "carryon", "1.13.0"),
            ("stonequarry_2.0.0.zip", "stonequarry", "2.0.0"),
        ]);
        let lock = build_lock(dir.path(), &info(Some("anego"), Some("1.2.0"))).unwrap();
        assert_eq!(lock.mods.len(), 2);
        assert_eq!(lock.mods[0].modid, "carryon");
        assert_eq!(lock.mods[0].filename.as_deref(), Some("carryon_1.13.0.zip"));
        assert_eq!(lock.mods[0].sha256.len(), 64);
        assert_eq!(lock.modpack_slug.as_deref(), Some("anego"));
    }

    #[test]
    fn status_reports_drift() {
        let dir = profile_with_mods(&[
            ("carryon_1.13.0.zip", "carryon", "1.13.0"),
            ("stonequarry_1.9.0.zip", "stonequarry", "1.9.0"),
            ("extra_1.0.0.zip", "extra", "1.0.0"),
        ]);
        let info = info(None, None);
        let mut lock = build_lock(dir.path(), &info).unwrap();
        // Drop the "extra" row, bump one version and corrupt one hash.
        lock.mods.retain(|row| row.modid != "extra");
        let carryon_hash = lock
            .mods
            .iter()
            .find(|row| row.modid == "carryon")
            .unwrap()
            .sha256
            .clone();
        for row in lock.mods.iter_mut() {
            if row.modid == "stonequarry" {
                row.version = "2.0.0".into();
                row.sha256 = "d".repeat(64);
            }
        }
        lock.mods.push(LockedMod {
            modid: "missingmod".into(),
            version: "1.0.0".into(),
            filename: Some("missingmod_1.0.0.zip".into()),
            sha256: "b".repeat(64),
        });

        let status = compute_status(dir.path(), &lock).unwrap();
        assert_eq!(status.in_sync, 1);
        assert_eq!(status.missing, 1);
        assert_eq!(status.mismatched, 1);
        assert_eq!(status.extra_count, 1);
        assert_eq!(status.extras[0].modid, "extra");
        let carryon = status
            .entries
            .iter()
            .find(|entry| entry.modid == "carryon")
            .unwrap();
        assert_eq!(carryon.state, "ok");
        assert_eq!(carryon.sha256, carryon_hash);
        let quarry = status
            .entries
            .iter()
            .find(|entry| entry.modid == "stonequarry")
            .unwrap();
        assert_eq!(quarry.state, "version-mismatch");
        assert_eq!(quarry.installed_version.as_deref(), Some("1.9.0"));
        let missing = status
            .entries
            .iter()
            .find(|entry| entry.modid == "missingmod")
            .unwrap();
        assert_eq!(missing.state, "missing");
    }

    #[test]
    fn status_flags_a_corrupted_zip() {
        let dir = profile_with_mods(&[("carryon_1.13.0.zip", "carryon", "1.13.0")]);
        let lock = PackLock {
            lock_version: LOCK_VERSION,
            modpack_slug: None,
            modpack_version: None,
            created_at: 0,
            mods: vec![LockedMod {
                modid: "carryon".into(),
                version: "1.13.0".into(),
                filename: Some("carryon_1.13.0.zip".into()),
                sha256: "c".repeat(64),
            }],
        };
        let status = compute_status(dir.path(), &lock).unwrap();
        assert_eq!(status.entries[0].state, "hash-mismatch");
        assert_eq!(status.mismatched, 1);
        assert_eq!(status.in_sync, 0);
    }
}
