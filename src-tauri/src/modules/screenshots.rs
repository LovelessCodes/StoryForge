//! Game screenshots: listing and thumbnail-sized previews from a profile's
//! `Screenshots/` folder.
//!
//! Previews are generated with the `image` crate and cached under the app
//! cache dir, keyed by source path, mtime and size, so revisiting the sheet
//! does not decode a 4K PNG again.

use std::{
    fs::{create_dir_all, read_dir},
    io::Cursor,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{command, AppHandle, Manager};

use super::errors::UiError;
use super::mods::sha256_hex;
use super::profiles::find_profile_by_id;
use crate::{log_error, log_info};

const SCREENSHOTS_DIR: &str = "Screenshots";
/// Guard the viewer against absurd files while still allowing 4K PNGs.
const MAX_SCREENSHOT_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: u64,
}

fn modified_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Every PNG in the profile's `Screenshots/` folder, newest first.
#[command]
pub fn get_profile_screenshots(
    app: AppHandle,
    profile_id: u64,
) -> Result<Vec<ScreenshotInfo>, UiError> {
    let (dir, _profile) = find_profile_by_id(&app, profile_id)?;
    let shots_dir = dir.join(SCREENSHOTS_DIR);
    if !shots_dir.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    for entry in read_dir(&shots_dir).map_err(|e| {
        log_error!("screenshots: read dir error: {e}");
        UiError::new("io_error", format!("Read dir error: {e}"))
    })? {
        let entry = entry.map_err(|e| {
            log_error!("screenshots: dir entry error: {e}");
            UiError::new("io_error", format!("Dir entry error: {e}"))
        })?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_png = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("png"))
            .unwrap_or(false);
        if !is_png {
            continue;
        }
        let size = entry.metadata().map(|metadata| metadata.len()).unwrap_or(0);
        items.push(ScreenshotInfo {
            modified: modified_ms(&path),
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            size,
        });
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.modified));
    log_info!("get_profile_screenshots: {} images", items.len());
    Ok(items)
}

fn thumbnail_cache_dir(app: &AppHandle) -> Result<PathBuf, UiError> {
    let base = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("screenshot-thumbs");
    create_dir_all(&dir).map_err(|e| {
        log_error!("screenshots: cache dir error: {e}");
        UiError::new("io_error", format!("Cache dir error: {e}"))
    })?;
    Ok(dir)
}

/// A cached, fit-inside-`size` PNG preview of one screenshot.
#[command]
pub fn get_screenshot_thumbnail(
    app: AppHandle,
    path: String,
    size: u32,
) -> Result<Response, UiError> {
    let source = Path::new(&path);
    if !source.exists() || !source.is_file() {
        return Err(UiError::new(
            "file_not_found",
            format!("Screenshot {} not found", source.display()),
        ));
    }
    let size = size.clamp(64, 1024);
    let key = format!(
        "{}-{}-{}.png",
        &sha256_hex(path.as_bytes())[..16],
        modified_ms(source),
        size
    );
    let cache_path = thumbnail_cache_dir(&app)?.join(&key);
    if let Ok(bytes) = std::fs::read(&cache_path) {
        return Ok(Response::new(bytes));
    }

    let image = image::open(source).map_err(|e| {
        log_error!("screenshots: decode error: {e}");
        UiError::new(
            "decode_error",
            format!("Could not read the screenshot: {e}"),
        )
    })?;
    let thumbnail = image.thumbnail(size, size);
    let mut cursor = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| {
            log_error!("screenshots: encode error: {e}");
            UiError::new("encode_error", format!("Could not encode the preview: {e}"))
        })?;
    let bytes = cursor.into_inner();
    let _ = std::fs::write(&cache_path, &bytes);
    Ok(Response::new(bytes))
}

/// The full screenshot bytes, for the in-app viewer.
#[command]
pub fn read_screenshot(path: String) -> Result<Response, UiError> {
    let source = Path::new(&path);
    let metadata = std::fs::metadata(source).map_err(|e| {
        log_error!("screenshots: read error: {e}");
        UiError::new("read_failed", format!("Could not read the screenshot: {e}"))
    })?;
    if metadata.len() > MAX_SCREENSHOT_BYTES {
        return Err(UiError::new(
            "too_large",
            "The screenshot is too large to preview",
        ));
    }
    let bytes = std::fs::read(source).map_err(|e| {
        log_error!("screenshots: read error: {e}");
        UiError::new("read_failed", format!("Could not read the screenshot: {e}"))
    })?;
    Ok(Response::new(bytes))
}
