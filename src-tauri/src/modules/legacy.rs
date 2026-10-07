//! Migration of "installations" from the previous Story Forge release.
//!
//! A legacy installation folder is the same data as a profile (Mods, Saves,
//! Maps, ModConfig, Logs, clientsettings.json) — only the manifest file is
//! named differently (`installation.json` vs `profile.json`). Migration places
//! the folder in the profiles root (move or copy, at the user's choice) and
//! converts the manifest, preserving display name, version, playtime,
//! favorite flag, icon and environment variables.
//!
//! Completed migrations are recorded in `<app data>/legacy-migration.json`, so
//! the UI can tell "already imported" apart from a folder-name collision (a
//! collision imports under a suffixed folder name instead of failing).
//!
//! The legacy folder location is read from the previous app's persisted
//! settings (`store/settings.json`), falling back to
//! `<app data>/installations`.

use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, remove_file, rename, write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use fs_extra::dir::{copy, CopyOptions};
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::paths::{MODS_DIR, PROFILE_JSON};
use super::profiles::{write_profile_json, ProfileInfo};
use super::utils::{
    dir_name, dir_size_cached, format_size, profiles_folder, profiles_subdir, require_managed_path,
};
use crate::{log_error, log_info};

const LEGACY_MANIFEST: &str = "installation.json";
const LEGACY_DEFAULT_SUBDIR: &str = "installations";
/// Persisted settings files of the previous app (release and dev builds).
const LEGACY_SETTINGS_FILES: [&str; 2] = ["settings.json", "settings.dev.json"];
const MIGRATION_LOG_FILE: &str = "legacy-migration.json";

#[derive(Debug, Clone, Serialize)]
pub struct LegacyInstallation {
    pub name: String,
    pub version: String,
    pub folder: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_display: String,
    pub mod_count: usize,
    pub already_migrated: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LegacyMigrationSkip {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LegacyMigrationReport {
    pub migrated: usize,
    pub skipped: Vec<LegacyMigrationSkip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyMigrationEntry {
    source_folder: String,
    target_path: String,
    name: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LegacyMigrationLog {
    #[serde(default)]
    migrations: Vec<LegacyMigrationEntry>,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn migration_log_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    Ok(app_data_dir(app)?.join(MIGRATION_LOG_FILE))
}

fn read_migration_log(app: &AppHandle) -> LegacyMigrationLog {
    migration_log_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_migration_log(app: &AppHandle, log: &LegacyMigrationLog) -> Result<(), UiError> {
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

/// Pure resolution of the previous app's installations folder from the raw
/// contents of its settings files (in order; later files override earlier
/// ones, so dev settings win over release settings).
fn legacy_root_from_settings(data: &Path, settings: &[String]) -> Option<PathBuf> {
    let mut parent: Option<PathBuf> = None;
    let mut subdir = LEGACY_DEFAULT_SUBDIR.to_string();
    for content in settings {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
            continue;
        };
        if let Some(value) = value.get("installationsParent").and_then(|v| v.as_str()) {
            if !value.is_empty() {
                parent = Some(PathBuf::from(value));
            }
        }
        if let Some(value) = value.get("installationsSubdir").and_then(|v| v.as_str()) {
            if !value.is_empty() {
                subdir = value.to_string();
            }
        }
    }

    let root = parent.unwrap_or_else(|| data.to_path_buf()).join(subdir);
    root.is_dir().then_some(root)
}

/// Resolves the folder that held the previous app's installations.
///
/// Reads the legacy persisted settings for a custom parent/subdir; both the
/// release and dev settings files are consulted (dev overrides release).
fn legacy_root(app: &AppHandle) -> Result<Option<PathBuf>, UiError> {
    let data = app_data_dir(app)?;
    let store = data.join("store");
    let settings: Vec<String> = LEGACY_SETTINGS_FILES
        .iter()
        .filter_map(|file| read_to_string(store.join(file)).ok())
        .collect();
    Ok(legacy_root_from_settings(&data, &settings))
}

/// Resolves the folder to scan: an explicitly chosen folder (absolute and
/// existing) or the previous app's recorded/default location.
fn scan_root(app: &AppHandle, root_override: Option<&str>) -> Result<Option<PathBuf>, UiError> {
    if let Some(root) = root_override {
        let path = PathBuf::from(root);
        if !path.is_absolute() {
            return Err(UiError::new(
                "invalid_path",
                "The folder must be an absolute path",
            ));
        }
        if !path.is_dir() {
            return Err(UiError::not_found("The selected folder does not exist"));
        }
        return Ok(Some(path));
    }
    legacy_root(app)
}

fn count_zips(dir: &Path) -> usize {
    read_dir(dir.join(MODS_DIR))
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

/// Returns a free folder inside the profiles root, suffixing on collisions.
pub(crate) fn free_profile_dir(root: &Path, folder: &str) -> PathBuf {
    let candidate = root.join(folder);
    if !candidate.exists() {
        return candidate;
    }
    for index in 2..=50u32 {
        let candidate = root.join(format!("{folder}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    root.join(format!("{folder}-{}", now_nanos()))
}

/// Copies `source` to a freshly chosen target folder via a hidden staging dir,
/// so a collision or a partial copy can never touch an existing profile.
pub(crate) fn copy_profile_dir(
    root: &Path,
    source: &Path,
    folder: &str,
) -> Result<PathBuf, UiError> {
    let target = free_profile_dir(root, folder);
    let staging = root.join(format!(".staging-{}", now_nanos()));
    create_dir_all(&staging).map_err(|e| {
        UiError::new(
            "create_dir_failed",
            format!("Failed to create staging folder: {e}"),
        )
    })?;

    let mut options = CopyOptions::new();
    options.overwrite = false;
    options.copy_inside = false;
    let result = copy(source, &staging, &options);
    if let Err(e) = result {
        let _ = remove_dir_all(&staging);
        return Err(UiError::new(
            "copy_failed",
            format!("Failed to copy {}: {e}", folder),
        ));
    }

    let copied = staging.join(dir_name(source));
    if !copied.is_dir() || rename(&copied, &target).is_err() {
        let _ = remove_dir_all(&staging);
        return Err(UiError::new(
            "copy_failed",
            format!("Failed to move {} into the profiles folder", folder),
        ));
    }
    let _ = remove_dir_all(&staging);
    Ok(target)
}

/// Lists installations from the previous app that can be imported.
///
/// `root` restricts the scan to an explicitly chosen folder (for custom
/// installations folders the app cannot locate by itself).
#[command]
pub async fn detect_legacy_installations(
    app: AppHandle,
    root: Option<String>,
) -> Result<Vec<LegacyInstallation>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_blocking(&handle, root.as_deref()))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Legacy scan failed: {e}")))?
}

fn detect_blocking(
    app: &AppHandle,
    root_override: Option<&str>,
) -> Result<Vec<LegacyInstallation>, UiError> {
    let Some(root) = scan_root(app, root_override)? else {
        return Ok(Vec::new());
    };
    log_info!("legacy: scanning {}", root.display());

    let log = read_migration_log(app);
    let mut results = Vec::new();

    for entry in read_dir(&root)
        .map_err(|e| UiError::new("io_error", format!("Failed to read legacy folder: {e}")))?
    {
        let Ok(entry) = entry else { continue };
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().to_string();
        if folder.starts_with('.') {
            continue;
        }

        let manifest = dir.join(LEGACY_MANIFEST);
        let has_manifest = manifest.is_file();
        let has_mods = dir.join(MODS_DIR).is_dir();
        if !has_manifest && !has_mods {
            continue;
        }

        let info = if has_manifest {
            read_to_string(&manifest)
                .ok()
                .and_then(|content| json5::from_str::<ProfileInfo>(&content).ok())
        } else {
            None
        };
        let name = info
            .as_ref()
            .map(|i| i.name.clone())
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| folder.clone());
        let version = info.as_ref().map(|i| i.version.clone()).unwrap_or_default();

        let already_migrated = log.migrations.iter().any(|entry| {
            entry.source_folder == folder
                && Path::new(&entry.target_path).join(PROFILE_JSON).is_file()
        });

        let size_bytes = dir_size_cached(&dir);
        results.push(LegacyInstallation {
            name,
            version,
            folder: folder.clone(),
            path: dir.to_string_lossy().to_string(),
            size_bytes,
            size_display: format_size(size_bytes),
            mod_count: count_zips(&dir),
            already_migrated,
        });
    }

    results.sort_by_key(|item| item.name.to_lowercase());
    log_info!("legacy: found {} installation(s)", results.len());
    Ok(results)
}

/// Imports legacy installations into the profiles folder.
///
/// `mode` is `"move"` (relocate, the previous folder disappears) or `"copy"`
/// (keep the previous folder usable, at the cost of extra disk space). Folder
/// name collisions import under a suffixed name (e.g. `default-2`).
#[command]
pub async fn migrate_legacy_installations(
    app: AppHandle,
    folders: Vec<String>,
    mode: String,
    root: Option<String>,
) -> Result<LegacyMigrationReport, UiError> {
    if mode != "move" && mode != "copy" {
        return Err(UiError::new(
            "invalid_mode",
            "Migration mode must be \"move\" or \"copy\"",
        ));
    }
    let handle = app.clone();
    tokio::task::spawn_blocking(move || migrate_blocking(&handle, folders, &mode, root.as_deref()))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Migration failed: {e}")))?
}

fn migrate_blocking(
    app: &AppHandle,
    folders: Vec<String>,
    mode: &str,
    root_override: Option<&str>,
) -> Result<LegacyMigrationReport, UiError> {
    let Some(old_root) = scan_root(app, root_override)? else {
        return Err(UiError::not_found(
            "No installations from the previous Story Forge were found",
        ));
    };
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

    for folder in folders {
        // The folder names come from the UI but are still untrusted input.
        if folder.is_empty()
            || folder.starts_with('.')
            || folder.contains('/')
            || folder.contains('\\')
            || folder.contains("..")
            || Path::new(&folder).file_name().and_then(|n| n.to_str()) != Some(folder.as_str())
        {
            report.skipped.push(LegacyMigrationSkip {
                name: folder,
                reason: "invalid folder name".into(),
            });
            continue;
        }

        let source = old_root.join(&folder);
        if !source.is_dir() {
            report.skipped.push(LegacyMigrationSkip {
                name: folder,
                reason: "folder no longer exists".into(),
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
                    name: folder,
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
                        name: folder,
                        reason: e.message,
                    });
                    continue;
                }
            }
        };

        // Convert the manifest: the new app reads profile.json only.
        let manifest = target.join(LEGACY_MANIFEST);
        let info = if manifest.is_file() {
            match read_to_string(&manifest) {
                Ok(content) => json5::from_str::<ProfileInfo>(&content).unwrap_or_else(|e| {
                    log_error!("legacy: unreadable manifest for {}: {e}", folder);
                    ProfileInfo {
                        name: folder.clone(),
                        ..Default::default()
                    }
                }),
                Err(e) => {
                    log_error!("legacy: failed to read manifest for {}: {e}", folder);
                    ProfileInfo {
                        name: folder.clone(),
                        ..Default::default()
                    }
                }
            }
        } else {
            ProfileInfo {
                name: folder.clone(),
                ..Default::default()
            }
        };

        if let Err(e) = write_profile_json(&target, &info) {
            report.skipped.push(LegacyMigrationSkip {
                name: folder,
                reason: format!("failed to write profile.json: {}", e.message),
            });
            continue;
        }
        // The legacy manifest is no longer needed once converted.
        if manifest.is_file() {
            let _ = remove_file(&manifest);
        }

        log_info!("legacy: migrated {} ({})", info.name, mode);
        log.migrations.push(LegacyMigrationEntry {
            source_folder: folder,
            target_path: target.to_string_lossy().to_string(),
            name: info.name,
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

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("storyforge-legacy-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("installations")).expect("create scratch dir");
        dir
    }

    #[test]
    fn defaults_to_the_app_data_installations_folder() {
        let data = scratch("default");
        assert_eq!(
            legacy_root_from_settings(&data, &[]),
            Some(data.join("installations"))
        );
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn honours_a_custom_parent_from_the_old_settings() {
        let data = scratch("custom");
        let parent = scratch("parent");
        let settings = format!(
            r#"{{"installationsParent":"{}","installationsSubdir":"installations"}}"#,
            parent.display()
        );
        assert_eq!(
            legacy_root_from_settings(&data, &[settings]),
            Some(parent.join("installations"))
        );
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn later_settings_override_earlier_ones() {
        let data = scratch("override");
        let parent = scratch("override-parent");
        let release = format!(r#"{{"installationsParent":"{}"}}"#, parent.display());
        let dev = r#"{"installationsSubdir":"dev-installs"}"#.to_string();
        std::fs::create_dir_all(parent.join("dev-installs")).expect("create dev dir");
        assert_eq!(
            legacy_root_from_settings(&data, &[release, dev]),
            Some(parent.join("dev-installs"))
        );
        let _ = std::fs::remove_dir_all(&data);
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn unresolvable_root_is_none() {
        let missing =
            std::env::temp_dir().join(format!("storyforge-legacy-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&missing);
        assert!(legacy_root_from_settings(&missing, &[]).is_none());
    }
}
