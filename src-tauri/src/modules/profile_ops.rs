//! Profile lifecycle operations on top of the per-profile data directories.
//!
//! A Story Forge profile is a full Vintage Story data directory (mods, saves,
//! configs) pinned to a game version. Core create/edit/delete-live paths live
//! in [`super::profiles`]; this module adds the Macheim-style management
//! operations: clone, rename, soft delete with restore/purge, and local
//! export/import (JSON file or compressed share code). Everything is copied,
//! never linked, and deletes are moves into a hidden `.deleted` folder so the
//! user can undo them.

use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, rename, write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use fs_extra::dir::{copy, CopyOptions};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use tauri::{command, AppHandle};

use super::errors::UiError;
use super::mods;
use super::packs;
use super::paths::mods_dir;
use super::profiles::{
    find_profile_by_id, read_profile_json, write_profile_json, ProfileInfo, ProfileResult,
};
use super::utils::{
    dir_name, dir_size_cached, format_size, generate_id, profiles_folder, profiles_subdir,
    require_managed_path, safe_file_name,
};

/// Hidden folder (inside the profiles root) that holds soft-deleted profiles.
pub const DELETED_DIR: &str = ".deleted";

/// Prefix marking a compressed share-code string.
pub const SHARE_CODE_PREFIX: &str = "SF1.";

/// Maximum accepted size of an imported profile file (bytes).
const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct DeletedProfile {
    pub archive_name: String,
    pub name: String,
    pub version: String,
    pub mod_count: usize,
    pub deleted_at: u64,
}

/// Local (offline) representation of a profile, used for export files and
/// share codes. Field names are camelCase to match the frontend import flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileExport {
    pub format: String,
    pub name: String,
    pub version: String,
    pub start_params: String,
    pub mods: String,
    #[serde(default)]
    pub modpack_slug: Option<String>,
    #[serde(default)]
    pub modpack_version: Option<String>,
    #[serde(default)]
    pub env_vars: std::collections::HashMap<String, String>,
    /// The profile's pack lock, when it has one. Carried by exports and share
    /// codes so an imported pack arrives pinned.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock: Option<packs::PackLock>,
}

fn profiles_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    Ok(profiles_folder(app.clone())?.join(profiles_subdir(app.clone())))
}

fn deleted_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    Ok(profiles_dir(app)?.join(DELETED_DIR))
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Validates a user-supplied profile name and returns it trimmed.
///
/// The folder name is always derived with [`safe_file_name`]; this check only
/// rejects input that cannot become a usable profile name.
pub(crate) fn validate_profile_name(name: &str) -> Result<String, UiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(UiError::new("invalid_name", "Profile name cannot be empty"));
    }
    if trimmed.len() > 100 {
        return Err(UiError::new(
            "invalid_name",
            "Profile name must be 100 characters or fewer",
        ));
    }
    if trimmed.starts_with('.') {
        return Err(UiError::new(
            "invalid_name",
            "Profile name cannot start with a dot",
        ));
    }
    if trimmed.chars().any(|c| {
        c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
    }) {
        return Err(UiError::new(
            "invalid_name",
            "Profile name contains characters that are not allowed in file names",
        ));
    }
    Ok(trimmed.to_string())
}

/// Rejects strings that are not a single plain path component (used for
/// archive names coming from the UI).
fn require_plain_component(value: &str, what: &str) -> Result<(), UiError> {
    if value.is_empty()
        || value.starts_with('.')
        || value.contains('/')
        || value.contains('\\')
        || value.contains("..")
        || Path::new(value).file_name().and_then(|n| n.to_str()) != Some(value)
    {
        return Err(UiError::new(
            "invalid_path",
            format!("Invalid {what}: {value}"),
        ));
    }
    Ok(())
}

/// Counts the live (non-hidden) profile folders.
fn count_live_profiles(app: &AppHandle) -> Result<usize, UiError> {
    let root = profiles_dir(app)?;
    if !root.is_dir() {
        return Ok(0);
    }
    let count = read_dir(&root)
        .map_err(|e| UiError::new("io_error", format!("Failed to read profiles: {e}")))?
        .flatten()
        .filter(|entry| {
            entry.path().is_dir() && !entry.file_name().to_string_lossy().starts_with('.')
        })
        .count();
    Ok(count)
}

fn count_mods(dir: &Path) -> usize {
    read_dir(mods_dir(dir))
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path().is_file()
                        && e.path()
                            .extension()
                            .map(|x| x.eq_ignore_ascii_case("zip"))
                            .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn profile_result_from_dir(dir: &Path) -> Result<ProfileResult, UiError> {
    let fallback_name = dir_name(dir);
    let info = read_profile_json(dir).unwrap_or(ProfileInfo {
        name: fallback_name,
        ..Default::default()
    });
    let size_bytes = dir_size_cached(dir);
    Ok(ProfileResult {
        id: generate_id(&dir_name(dir)),
        name: info.name,
        version: info.version,
        start_params: info.start_params,
        path: dir.to_string_lossy().to_string(),
        size_bytes,
        size_display: format_size(size_bytes),
        favorite: info.favorite,
        icon: info.icon,
        last_played: info.last_played,
        total_time_played: info.total_time_played,
        modpack_slug: info.modpack_slug,
        modpack_version: info.modpack_version,
        env_vars: info.env_vars,
        external: false,
        backup_on_play: info.backup_on_play,
        backup_limit: info.backup_limit,
        ignore_game_defaults: info.ignore_game_defaults,
    })
}

/// Copies a profile to a new profile with the given display name.
#[command]
pub async fn clone_profile(
    app: AppHandle,
    id: u64,
    name: String,
) -> Result<ProfileResult, UiError> {
    let new_name = validate_profile_name(&name)?;
    let handle = app.clone();
    tokio::task::spawn_blocking(move || clone_profile_blocking(&handle, id, &new_name))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Clone failed: {e}")))?
}

fn clone_profile_blocking(
    app: &AppHandle,
    id: u64,
    new_name: &str,
) -> Result<ProfileResult, UiError> {
    let (source_dir, mut info) = find_profile_by_id(app, id)?;
    let root = profiles_dir(app)?;
    let folder = safe_file_name(new_name)?;
    let target_dir = root.join(&folder);
    require_managed_path(app, &target_dir, "profile")?;

    if target_dir.exists() {
        return Err(UiError::new(
            "name_taken",
            format!("A profile named \"{new_name}\" already exists"),
        ));
    }
    if !source_dir.is_dir() {
        return Err(UiError::not_found("Source profile folder is missing"));
    }

    let mut options = CopyOptions::new();
    options.overwrite = false;
    options.copy_inside = false;
    copy(&source_dir, &root, &options)
        .map_err(|e| UiError::new("copy_failed", format!("Failed to copy profile: {e}")))?;

    // `copy` creates `<root>/<source folder>`; move it when the new name
    // sanitizes to a different folder name.
    let copied_dir = root.join(dir_name(&source_dir));
    if copied_dir != target_dir {
        if let Err(e) = rename(&copied_dir, &target_dir) {
            let _ = remove_dir_all(&copied_dir);
            return Err(UiError::new(
                "copy_failed",
                format!("Failed to move cloned profile into place: {e}"),
            ));
        }
    }

    info.name = new_name.to_string();
    write_profile_json(&target_dir, &info)?;
    profile_result_from_dir(&target_dir)
}

/// Renames a profile folder and its display name.
///
/// The profile id is derived from the folder name, so the returned profile has
/// a new id; callers must refresh their list and update selections.
#[command]
pub async fn rename_profile(
    app: AppHandle,
    id: u64,
    name: String,
) -> Result<ProfileResult, UiError> {
    let new_name = validate_profile_name(&name)?;
    let handle = app.clone();
    tokio::task::spawn_blocking(move || rename_profile_blocking(&handle, id, &new_name))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Rename failed: {e}")))?
}

fn rename_profile_blocking(
    app: &AppHandle,
    id: u64,
    new_name: &str,
) -> Result<ProfileResult, UiError> {
    let (source_dir, mut info) = find_profile_by_id(app, id)?;
    let root = profiles_dir(app)?;
    let folder = safe_file_name(new_name)?;
    let target_dir = root.join(&folder);
    require_managed_path(app, &target_dir, "profile")?;

    if source_dir != target_dir {
        if target_dir.exists() {
            return Err(UiError::new(
                "name_taken",
                format!("A profile named \"{new_name}\" already exists"),
            ));
        }
        rename(&source_dir, &target_dir).map_err(|e| {
            UiError::new(
                "rename_failed",
                format!("Failed to rename profile folder: {e}"),
            )
        })?;
    }

    info.name = new_name.to_string();
    write_profile_json(&target_dir, &info)?;
    profile_result_from_dir(&target_dir)
}

/// Moves a profile into the hidden `.deleted` folder (undoable).
///
/// Refuses to delete the profile the UI is currently using (`active_id`) and
/// refuses to delete the last remaining profile, so the app always has one.
#[command]
pub async fn soft_delete_profile(
    app: AppHandle,
    id: u64,
    active_id: Option<u64>,
) -> Result<DeletedProfile, UiError> {
    if active_id == Some(id) {
        return Err(UiError::new(
            "profile_active",
            "Cannot delete the current profile — switch to another profile first",
        ));
    }
    let handle = app.clone();
    tokio::task::spawn_blocking(move || soft_delete_profile_blocking(&handle, id))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Delete failed: {e}")))?
}

fn soft_delete_profile_blocking(app: &AppHandle, id: u64) -> Result<DeletedProfile, UiError> {
    let (source_dir, info) = find_profile_by_id(app, id)?;
    require_managed_path(app, &source_dir, "profile")?;

    if super::profiles::is_external_profile_dir(app, &source_dir) {
        return Err(UiError::new(
            "external_profile",
            "This profile points at an existing game data folder — remove it from Story Forge instead of deleting the folder",
        ));
    }

    if count_live_profiles(app)? <= 1 {
        return Err(UiError::new(
            "last_profile",
            "At least one profile must remain — create another profile first",
        ));
    }

    let folder = dir_name(&source_dir);
    if folder.starts_with('.') {
        return Err(UiError::new("invalid_path", "Cannot delete this folder"));
    }

    let archive_name = format!("{folder}-{}", now_nanos());
    let trash = deleted_dir(app)?;
    create_dir_all(&trash).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create deleted profiles folder: {e}"),
        )
    })?;
    let target = trash.join(&archive_name);

    let mod_count = count_mods(&source_dir);
    super::utils::move_folder(source_dir, target)?;

    Ok(DeletedProfile {
        archive_name,
        name: info.name,
        version: info.version,
        mod_count,
        deleted_at: (now_nanos() / 1_000_000) as u64,
    })
}

/// Lists soft-deleted profiles, newest first.
#[command]
pub async fn list_deleted_profiles(app: AppHandle) -> Result<Vec<DeletedProfile>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || list_deleted_profiles_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Scan failed: {e}")))?
}

fn list_deleted_profiles_blocking(app: &AppHandle) -> Result<Vec<DeletedProfile>, UiError> {
    let trash = deleted_dir(app)?;
    if !trash.is_dir() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for entry in read_dir(&trash)
        .map_err(|e| UiError::new("io_error", format!("Failed to read deleted profiles: {e}")))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let archive_name = entry.file_name().to_string_lossy().to_string();
        let info = read_profile_json(&dir).unwrap_or(ProfileInfo {
            name: archive_name.clone(),
            ..Default::default()
        });
        // Folder names are always `<name>-<nanos>`; fall back to the mtime.
        let deleted_at = archive_name
            .rsplit_once('-')
            .and_then(|(_, ts)| ts.parse::<u128>().ok())
            .map(|n| (n / 1_000_000) as u64)
            .or_else(|| {
                dir.metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
            })
            .unwrap_or(0);
        results.push(DeletedProfile {
            archive_name,
            name: info.name,
            version: info.version,
            mod_count: count_mods(&dir),
            deleted_at,
        });
    }

    results.sort_by_key(|item| std::cmp::Reverse(item.deleted_at));
    Ok(results)
}

/// Restores a soft-deleted profile, optionally under a new name.
#[command]
pub async fn restore_deleted_profile(
    app: AppHandle,
    archive_name: String,
    new_name: Option<String>,
) -> Result<ProfileResult, UiError> {
    require_plain_component(&archive_name, "archive name")?;
    let name = match new_name {
        Some(n) => Some(validate_profile_name(&n)?),
        None => None,
    };
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        restore_deleted_profile_blocking(&handle, &archive_name, name)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Restore failed: {e}")))?
}

fn restore_deleted_profile_blocking(
    app: &AppHandle,
    archive_name: &str,
    new_name: Option<String>,
) -> Result<ProfileResult, UiError> {
    let trash = deleted_dir(app)?;
    let source_dir = trash.join(archive_name);
    if !source_dir.is_dir() {
        return Err(UiError::not_found(format!(
            "Deleted profile {archive_name} not found"
        )));
    }

    let root = profiles_dir(app)?;
    let default_folder = archive_name
        .rsplit_once('-')
        .map(|(base, _)| base.to_string())
        .unwrap_or_else(|| archive_name.to_string());
    let folder = match &new_name {
        Some(n) => safe_file_name(n)?,
        None => default_folder,
    };
    let target_dir = root.join(&folder);
    require_managed_path(app, &target_dir, "profile")?;

    if target_dir.exists() {
        return Err(UiError::new(
            "name_taken",
            "A profile with that folder name already exists — restore with a new name",
        ));
    }

    super::utils::move_folder(source_dir, target_dir.clone())?;

    if let Some(n) = new_name {
        let mut info = read_profile_json(&target_dir)?;
        info.name = n;
        write_profile_json(&target_dir, &info)?;
    }

    profile_result_from_dir(&target_dir)
}

/// Permanently deletes one soft-deleted profile.
#[command]
pub async fn purge_deleted_profile(app: AppHandle, archive_name: String) -> Result<(), UiError> {
    require_plain_component(&archive_name, "archive name")?;
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let target_dir = deleted_dir(&handle)?.join(&archive_name);
        if target_dir.is_dir() {
            remove_dir_all(&target_dir).map_err(|e| {
                UiError::new("remove_failed", format!("Failed to purge profile: {e}"))
            })?;
        }
        Ok::<(), UiError>(())
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Purge failed: {e}")))?
}

/// Permanently deletes every soft-deleted profile. Returns the count removed.
#[command]
pub async fn purge_deleted_profiles(app: AppHandle) -> Result<usize, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let trash = deleted_dir(&handle)?;
        let mut removed = 0usize;
        if !trash.is_dir() {
            return Ok::<usize, UiError>(0);
        }
        for entry in read_dir(&trash)
            .map_err(|e| UiError::new("io_error", format!("Failed to read deleted profiles: {e}")))?
            .flatten()
        {
            let dir = entry.path();
            if dir.is_dir() && remove_dir_all(&dir).is_ok() {
                removed += 1;
            }
        }
        Ok(removed)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Purge failed: {e}")))?
}

/// Builds the local export payload for a profile (mods list included).
fn build_export(app: &AppHandle, id: u64) -> Result<ProfileExport, UiError> {
    let (dir, info) = find_profile_by_id(app, id)?;
    let mods_string = if mods_dir(&dir).is_dir() {
        match mods::get_mods_in_dir(&mods_dir(&dir)) {
            Ok(result) => result
                .mods
                .iter()
                .map(|m| format!("{}@{}", m.modid, m.version))
                .collect::<Vec<_>>()
                .join(","),
            Err(e) => {
                crate::log_error!("profile_ops: failed to scan mods for export: {}", e.message);
                String::new()
            }
        }
    } else {
        String::new()
    };

    let lock = packs::read_lock(&dir).ok().flatten();

    Ok(ProfileExport {
        format: "storyforge-profile".into(),
        name: info.name,
        version: info.version,
        start_params: info.start_params,
        mods: mods_string,
        modpack_slug: info.modpack_slug,
        modpack_version: info.modpack_version,
        env_vars: info.env_vars,
        lock,
    })
}

/// Returns a profile as a pretty-printed JSON export string.
#[command]
pub async fn export_profile(app: AppHandle, id: u64) -> Result<String, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let export = build_export(&handle, id)?;
        serde_json::to_string_pretty(&export)
            .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Export failed: {e}")))?
}

/// Writes a profile export to a user-chosen file path.
#[command]
pub async fn export_profile_file(app: AppHandle, id: u64, path: String) -> Result<(), UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let export = build_export(&handle, id)?;
        let json = serde_json::to_string_pretty(&export)
            .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
        write(&path, json)
            .map_err(|e| UiError::new("write_failed", format!("Failed to write export file: {e}")))
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Export failed: {e}")))?
}

/// Returns a compressed, base64-encoded share code for a profile.
#[command]
pub async fn export_profile_code(app: AppHandle, id: u64) -> Result<String, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || {
        let export = build_export(&handle, id)?;
        let json = serde_json::to_string(&export)
            .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
        let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
        encoder
            .write_all(json.as_bytes())
            .map_err(|e| UiError::new("encode_failed", format!("Failed to compress code: {e}")))?;
        let compressed = encoder
            .finish()
            .map_err(|e| UiError::new("encode_failed", format!("Failed to compress code: {e}")))?;
        Ok(format!("{SHARE_CODE_PREFIX}{}", BASE64.encode(compressed)))
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Export failed: {e}")))?
}

/// Decodes a share code (or passes raw JSON through) and returns the JSON text.
#[command]
pub async fn import_profile_code(code: String) -> Result<String, UiError> {
    tokio::task::spawn_blocking(move || {
        let trimmed = code.trim();
        if !trimmed.starts_with(SHARE_CODE_PREFIX) {
            // Allow raw JSON payloads for convenience.
            if trimmed.starts_with('{') {
                return Ok(trimmed.to_string());
            }
            return Err(UiError::new(
                "invalid_code",
                "Share code must start with SF1. — paste the full code",
            ));
        }
        let payload = &trimmed[SHARE_CODE_PREFIX.len()..];
        let compressed = BASE64.decode(payload).map_err(|e| {
            UiError::new(
                "invalid_code",
                format!("Share code is not valid base64: {e}"),
            )
        })?;
        let mut decoder = GzDecoder::new(compressed.as_slice());
        let mut json = String::new();
        decoder.read_to_string(&mut json).map_err(|e| {
            UiError::new(
                "invalid_code",
                format!("Failed to decompress share code: {e}"),
            )
        })?;
        Ok(json)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}

/// Reads a profile export file and returns its JSON text.
#[command]
pub async fn read_profile_file(path: String) -> Result<String, UiError> {
    tokio::task::spawn_blocking(move || {
        let metadata = std::fs::metadata(&path)
            .map_err(|e| UiError::new("read_failed", format!("Failed to read export file: {e}")))?;
        if metadata.len() > MAX_IMPORT_BYTES {
            return Err(UiError::new(
                "read_failed",
                "Export file is too large to import (max 2 MB)",
            ));
        }
        read_to_string(&path)
            .map_err(|e| UiError::new("read_failed", format!("Failed to read export file: {e}")))
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Import failed: {e}")))?
}
