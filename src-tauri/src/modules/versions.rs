use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{read_dir, read_to_string, remove_dir_all, write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, Manager, State};

use crate::modules::utils::{dir_size_cached, format_size, move_folder};

use super::errors::UiError;
use super::utils::{
    normalize_path, require_managed_path, require_safe_destination, safe_file_name,
    versions_folder, versions_subdir,
};
use crate::{log_error, log_info};

/// File in the app data dir listing game versions that live outside the
/// versions folder (installed by another launcher or the stock game).
const EXTERNAL_VERSIONS_FILE: &str = "external-versions.json";

/// A version is incomplete (not fully installed) if its directory contains any sign
/// of an in-progress or interrupted download: a `.resume.json` manifest or an
/// archive file (`.tar.gz`, `.zip`) that hasn't been extracted yet.
fn is_incomplete(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|e| {
                let p: PathBuf = e.path();
                let name = p.to_string_lossy().to_string();
                name.ends_with(".resume.json")
                    || name.ends_with(".tar.gz")
                    || name.ends_with(".zip")
            })
        })
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize)]
pub struct VersionInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
    /// Full path of the version folder (managed or linked).
    pub path: String,
    /// Linked from outside the versions folder instead of downloaded here.
    pub external: bool,
    /// Where a linked version came from ("VS Launcher", "MVL", …).
    pub source: Option<String>,
}

/// A game version found in another launcher's data.
#[derive(Debug, Clone, Serialize)]
pub struct DetectedVersion {
    pub name: String,
    pub path: String,
    pub source: String,
}

/// A detected version plus its status, for the "link versions" banner/sheet.
#[derive(Debug, Clone, Serialize)]
pub struct LinkableVersion {
    pub name: String,
    pub path: String,
    pub source: String,
    /// A version with this name already exists in the versions folder.
    pub installed: bool,
    /// Already linked to this exact path.
    pub linked: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkVersionEntry {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkSkip {
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkVersionsReport {
    pub linked: usize,
    pub skipped: Vec<LinkSkip>,
}

/// A game version registered outside the versions folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalVersion {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ExternalVersionsFile {
    #[serde(default)]
    versions: Vec<ExternalVersion>,
}

/// True when a folder contains the markers of a Vintage Story install.
pub(crate) fn looks_like_game_dir(path: &Path) -> bool {
    if !path.is_dir() {
        return false;
    }
    const MARKERS: [&str; 8] = [
        "Vintagestory",
        "Vintagestory.exe",
        "Vintagestory.dll",
        "VintagestoryLib.dll",
        "Vintage Story.app",
        "VintagestoryServer",
        "VintagestoryServer.exe",
        "VintagestoryServer.dll",
    ];
    MARKERS.iter().any(|marker| path.join(marker).exists())
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, UiError> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(EXTERNAL_VERSIONS_FILE))
        .map_err(|e| UiError {
            name: "path_error".into(),
            message: format!("Failed to resolve app data dir: {e}"),
        })
}

/// Every linked version (whether or not its folder still exists).
pub(crate) fn external_versions(app: &AppHandle) -> Vec<ExternalVersion> {
    registry_path(app)
        .ok()
        .and_then(|path| read_to_string(path).ok())
        .and_then(|content| serde_json::from_str::<ExternalVersionsFile>(&content).ok())
        .map(|file| file.versions)
        .unwrap_or_default()
}

fn set_external_versions(app: &AppHandle, versions: &[ExternalVersion]) -> Result<(), UiError> {
    let file = ExternalVersionsFile {
        versions: versions.to_vec(),
    };
    let content = serde_json::to_string_pretty(&file)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
    write(registry_path(app)?, content)
        .map_err(|e| UiError::new("write_failed", format!("Failed to write registry: {e}")))
}

/// Resolves a version name to its folder: the managed versions folder first,
/// then any linked external folder.
pub(crate) fn resolve_version_dir(app: &AppHandle, version: &str) -> Result<PathBuf, UiError> {
    let folder = safe_file_name(version)?;
    let local = versions_folder(app.clone())?
        .join(versions_subdir(app.clone()))
        .join(&folder);
    if local.is_dir() {
        return Ok(local);
    }
    if let Some(entry) = external_versions(app)
        .into_iter()
        .find(|entry| entry.name == version)
    {
        let path = PathBuf::from(&entry.path);
        if path.is_dir() {
            return Ok(path);
        }
        return Err(UiError::not_found(format!(
            "Linked version {version} folder is missing: {}",
            path.display()
        )));
    }
    Err(UiError::not_found(format!(
        "Version {version} is not installed"
    )))
}

#[command]
pub async fn get_installed_versions(app: AppHandle) -> Result<Vec<VersionInfo>, UiError> {
    log_info!("get_installed_versions");
    let base_dir = versions_folder(app.clone())?;
    let subdir = versions_subdir(app.clone());
    let versions_dir = base_dir.join(&subdir);

    // Sizes walk the whole version tree; keep it off the UI thread.
    let mut versions = tokio::task::spawn_blocking(move || scan_installed_versions(&versions_dir))
        .await
        .map_err(|e| {
            log_error!("get_installed_versions: scan task failed: {e}");
            UiError::new("internal_error", format!("Versions scan failed: {e}"))
        })??;

    // Linked versions live outside the versions folder; a managed install with
    // the same name always wins.
    for entry in external_versions(&app) {
        if versions.iter().any(|version| version.name == entry.name) {
            continue;
        }
        let path = PathBuf::from(&entry.path);
        let size_bytes = if path.is_dir() {
            dir_size_cached(&path)
        } else {
            0
        };
        versions.push(VersionInfo {
            name: entry.name,
            size_bytes,
            size_display: format_size(size_bytes),
            path: entry.path,
            external: true,
            source: entry.source,
        });
    }

    Ok(versions)
}

/// Blocking scan behind `get_installed_versions`.
fn scan_installed_versions(versions_dir: &Path) -> Result<Vec<VersionInfo>, UiError> {
    if !versions_dir.exists() || !versions_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut versions = vec![];
    for entry in read_dir(versions_dir).map_err(|e| {
        log_error!("get_installed_versions: read_dir failed: {e}");
        UiError {
            name: "io_error".into(),
            message: format!("Failed to read versions directory: {e}"),
        }
    })? {
        let entry = entry.map_err(|e| {
            log_error!("get_installed_versions: dir entry error: {e}");
            UiError {
                name: "io_error".into(),
                message: format!("Failed to read directory entry: {e}"),
            }
        })?;
        if entry.path().is_dir() && !is_incomplete(&entry.path()) {
            if let Some(name) = entry.file_name().to_str() {
                let path = entry.path();
                let size_bytes = dir_size_cached(&path);
                versions.push(VersionInfo {
                    name: name.to_string(),
                    size_bytes,
                    size_display: format_size(size_bytes),
                    path: path.to_string_lossy().to_string(),
                    external: false,
                    source: None,
                });
            }
        }
    }
    Ok(versions)
}

#[command]
pub fn remove_installed_version(version: String, app: AppHandle) -> Result<String, UiError> {
    log_info!("remove_installed_version: {}", version);

    // Linked versions are never deleted from disk — only unregistered.
    if let Some(entry) = external_versions(&app)
        .into_iter()
        .find(|entry| entry.name == version)
    {
        let remaining: Vec<ExternalVersion> = external_versions(&app)
            .into_iter()
            .filter(|registered| registered.name != version)
            .collect();
        set_external_versions(&app, &remaining)?;
        log_info!(
            "remove_installed_version: unlinked {} ({})",
            version,
            entry.path
        );
        return Ok("unlinked".into());
    }

    let version = safe_file_name(&version)?;
    let subdir = versions_subdir(app.clone());
    let versions_path = versions_folder(app.clone())?.join(&subdir).join(&version);
    if !versions_path.exists() || !versions_path.is_dir() {
        log_error!("remove_installed_version: not found: {:?}", versions_path);
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                versions_path.to_string_lossy()
            ),
        });
    }
    remove_dir_all(&versions_path).map_err(|e| {
        log_error!("remove_installed_version: remove_dir_all failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove version directory: {e}"),
        }
    })?;
    Ok("removed".into())
}

/// Game versions found in other launchers' data, ready to be linked.
#[command]
pub async fn detect_linkable_versions(app: AppHandle) -> Result<Vec<LinkableVersion>, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || detect_linkable_blocking(&handle))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Version scan failed: {e}")))?
}

fn detect_linkable_blocking(app: &AppHandle) -> Result<Vec<LinkableVersion>, UiError> {
    let root = versions_folder(app.clone())?.join(versions_subdir(app.clone()));
    let installed: HashSet<String> = scan_installed_versions(&root)?
        .into_iter()
        .map(|version| version.name)
        .collect();
    let linked = external_versions(app);
    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut out: Vec<LinkableVersion> = Vec::new();

    let mut take = |detected: DetectedVersion| {
        let path = PathBuf::from(&detected.path);
        if !looks_like_game_dir(&path) {
            return;
        }
        let normalized = normalize_path(&path);
        if normalized.starts_with(normalize_path(&root)) || !seen.insert(normalized.clone()) {
            return;
        }
        let linked_same = linked.iter().any(|entry| {
            entry.name == detected.name && normalize_path(Path::new(&entry.path)) == normalized
        });
        let installed_same = installed.contains(&detected.name);
        out.push(LinkableVersion {
            installed: installed_same,
            linked: linked_same,
            name: detected.name,
            path: detected.path,
            source: detected.source,
        });
    };

    for detected in super::vs_launcher::detected_game_versions() {
        take(detected);
    }
    for detected in super::mvl::detected_game_versions() {
        take(detected);
    }
    for detected in super::waxlight::detected_game_versions() {
        take(detected);
    }
    for detected in super::cairn::detected_game_versions() {
        take(detected);
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    log_info!("detect_linkable_versions: found {} candidate(s)", out.len());
    Ok(out)
}

/// Links external version folders (no files are copied or moved).
#[command]
pub async fn link_external_versions(
    app: AppHandle,
    versions: Vec<LinkVersionEntry>,
) -> Result<LinkVersionsReport, UiError> {
    let handle = app.clone();
    tokio::task::spawn_blocking(move || link_blocking(&handle, versions))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Linking failed: {e}")))?
}

fn link_blocking(
    app: &AppHandle,
    entries: Vec<LinkVersionEntry>,
) -> Result<LinkVersionsReport, UiError> {
    let root = versions_folder(app.clone())?.join(versions_subdir(app.clone()));
    let installed: HashSet<String> = scan_installed_versions(&root)?
        .into_iter()
        .map(|version| version.name)
        .collect();
    let mut registered = external_versions(app);

    let report = apply_links(entries, &installed, &root, &mut registered);
    if report.linked > 0 {
        set_external_versions(app, &registered)?;
        log_info!("link_external_versions: linked {}", report.linked);
    }
    Ok(report)
}

/// Validation + registry update, split out so it is testable without an app.
fn apply_links(
    entries: Vec<LinkVersionEntry>,
    installed: &HashSet<String>,
    root: &Path,
    registered: &mut Vec<ExternalVersion>,
) -> LinkVersionsReport {
    let mut report = LinkVersionsReport {
        linked: 0,
        skipped: Vec::new(),
    };
    for entry in entries {
        let name = entry.name.trim().to_string();
        if name.is_empty() {
            report.skipped.push(LinkSkip {
                name: entry.path,
                reason: "empty version name".into(),
            });
            continue;
        }
        let path = PathBuf::from(entry.path.trim());
        if !looks_like_game_dir(&path) {
            report.skipped.push(LinkSkip {
                name,
                reason: "folder does not look like a Vintage Story install".into(),
            });
            continue;
        }
        let normalized = normalize_path(&path);
        if normalized.starts_with(normalize_path(root)) {
            report.skipped.push(LinkSkip {
                name,
                reason: "already inside the versions folder".into(),
            });
            continue;
        }
        if installed.contains(&name) {
            report.skipped.push(LinkSkip {
                name,
                reason: "a version with this name is already installed".into(),
            });
            continue;
        }

        if let Some(existing) = registered.iter_mut().find(|entry| entry.name == name) {
            if normalize_path(Path::new(&existing.path)) == normalized {
                report.skipped.push(LinkSkip {
                    name,
                    reason: "already linked".into(),
                });
                continue;
            }
            existing.path = path.to_string_lossy().to_string();
            existing.source = entry.source;
            report.linked += 1;
            continue;
        }

        registered.push(ExternalVersion {
            name,
            path: path.to_string_lossy().to_string(),
            source: entry.source,
        });
        report.linked += 1;
    }
    report
}

/// Stops linking a version. The folder is left untouched.
#[command]
pub fn unregister_external_version(app: AppHandle, name: String) -> Result<(), UiError> {
    let remaining: Vec<ExternalVersion> = external_versions(&app)
        .into_iter()
        .filter(|entry| entry.name != name)
        .collect();
    set_external_versions(&app, &remaining)
}

#[command]
pub async fn fetch_versions(
    client: State<'_, Arc<reqwest::Client>>,
) -> Result<Vec<String>, UiError> {
    let res = client
        .get("https://vsapi.betterjs.dev/versions")
        .send()
        .await
        .map_err(|e| {
            log_error!("fetch_versions: request failed: {e}");
            format!("Request error: {e}")
        })?;

    if !res.status().is_success() {
        log_error!("fetch_versions: HTTP {}", res.status());
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res.json::<Vec<String>>().await.map_err(|e| {
        log_error!("fetch_versions: JSON parse failed: {e}");
        format!("JSON error: {e}")
    })?;

    Ok(json)
}

#[command]
pub async fn move_versions_folder(
    app: AppHandle,
    source: String,
    destination: String,
    subdir: String,
) -> Result<String, UiError> {
    let src = PathBuf::from(&source).join(&subdir);
    let dst = PathBuf::from(&destination).join(&subdir);
    require_managed_path(&app, Path::new(&source), "Source directory")?;
    require_safe_destination(Path::new(&destination), "Destination")?;
    log_info!("move_versions_folder: {:?} -> {:?}", src, dst);
    let outcome = move_folder(src, dst)?;
    log_info!("move_versions_folder: {outcome}");
    Ok(outcome)
}

#[command]
pub async fn remove_all_versions(
    app: AppHandle,
    source: String,
    subdir: String,
) -> Result<String, UiError> {
    require_managed_path(&app, Path::new(&source), "Source directory")?;
    let source_path = PathBuf::from(source).join(&subdir);

    if !source_path.exists() || !source_path.is_dir() {
        return Ok("not_exists".into());
    }

    log_info!("remove_all_versions: {:?}", source_path);
    remove_dir_all(&source_path).map_err(|e| {
        log_error!("remove_all_versions: remove_dir_all failed: {e}");
        UiError {
            name: "remove_failed".into(),
            message: format!("Failed to remove versions directory: {e}"),
        }
    })?;

    Ok("removed".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_incomplete_detects_download_artifacts() {
        let tmp = tempfile::tempdir().unwrap();

        // Complete install: plain directory without download artifacts.
        let complete = tmp.path().join("complete");
        std::fs::create_dir(&complete).unwrap();
        std::fs::write(complete.join("Vintagestory"), b"bin").unwrap();
        assert!(!is_incomplete(&complete));

        for artifact in ["version.tar.gz", "version.zip", "version.resume.json"] {
            let dir = tmp.path().join(artifact.replace('.', "_"));
            std::fs::create_dir(&dir).unwrap();
            std::fs::write(dir.join(artifact), b"partial").unwrap();
            assert!(is_incomplete(&dir), "{artifact} should mark incomplete");
        }

        assert!(!is_incomplete(&tmp.path().join("does-not-exist")));
    }

    #[test]
    fn looks_like_game_dir_requires_install_markers() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(!looks_like_game_dir(tmp.path()));
        assert!(!looks_like_game_dir(&tmp.path().join("missing")));

        std::fs::write(tmp.path().join("Vintagestory.dll"), b"x").unwrap();
        assert!(looks_like_game_dir(tmp.path()));
    }

    #[test]
    fn apply_links_validates_and_upserts() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("versions");
        std::fs::create_dir_all(&root).unwrap();
        let game = tmp.path().join("External/1.21.3");
        std::fs::create_dir_all(&game).unwrap();
        std::fs::write(game.join("Vintagestory"), b"bin").unwrap();

        let entry = |name: &str, path: &Path| LinkVersionEntry {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            source: Some("Test".into()),
        };

        let mut registered: Vec<ExternalVersion> = Vec::new();
        let installed: HashSet<String> = HashSet::new();

        // A valid folder links once.
        let report = apply_links(
            vec![entry("1.21.3", &game)],
            &installed,
            &root,
            &mut registered,
        );
        assert_eq!(report.linked, 1);
        assert_eq!(registered.len(), 1);

        // Re-linking the same folder is a no-op.
        let report = apply_links(
            vec![entry("1.21.3", &game)],
            &installed,
            &root,
            &mut registered,
        );
        assert_eq!(report.linked, 0);
        assert_eq!(report.skipped[0].reason, "already linked");

        // A name that is already installed in the versions folder is skipped.
        let installed: HashSet<String> = ["1.21.3".to_string()].into_iter().collect();
        let report = apply_links(
            vec![entry("1.21.3", &game)],
            &installed,
            &root,
            &mut registered,
        );
        assert_eq!(report.linked, 0);
        assert_eq!(
            report.skipped[0].reason,
            "a version with this name is already installed"
        );

        // Non-game folders (and folders inside the versions root) are rejected.
        let installed: HashSet<String> = HashSet::new();
        let empty = tmp.path().join("Empty");
        std::fs::create_dir_all(&empty).unwrap();
        let inside = root.join("local-version");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::write(inside.join("Vintagestory"), b"bin").unwrap();
        let report = apply_links(
            vec![entry("2.0.0", &empty), entry("3.0.0", &inside)],
            &installed,
            &root,
            &mut registered,
        );
        assert_eq!(report.linked, 0);
        assert_eq!(report.skipped.len(), 2);
        assert_eq!(
            report.skipped[0].reason,
            "folder does not look like a Vintage Story install"
        );
        assert_eq!(
            report.skipped[1].reason,
            "already inside the versions folder"
        );
    }
}
