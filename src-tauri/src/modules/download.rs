use futures_util::StreamExt;
use reqwest::header::CONTENT_DISPOSITION;
use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, File},
    io::{self, BufReader, Write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, Emitter, Listener, Runtime, State};
use tokio_util::sync::CancellationToken;

use super::errors::UiError;
use super::paths::vintagestory_exe;
use super::utils::is_at_least_1_22_3;
use crate::{log_error, log_info};

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    phase: &'static str, // "download" | "extract" | "cancelled" | "done"
    downloaded: Option<u64>,
    total: Option<u64>,
    percent: Option<f64>,
    current: Option<u64>, // for extract: files processed
    count: Option<u64>,   // for extract: total files considered
    message: Option<String>,
}

/// Context shared by the download and extraction helpers.
struct DownloadContext<R: Runtime> {
    app: AppHandle<R>,
    event: String,
    token: CancellationToken,
}

impl<R: Runtime> DownloadContext<R> {
    fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    fn emit(&self, payload: ProgressPayload) -> Result<(), UiError> {
        self.app
            .emit(&self.event, payload)
            .map_err(|e| UiError::from(format!("emit error: {e}")))
    }

    fn cancelled_payload(message: impl Into<String>) -> ProgressPayload {
        ProgressPayload {
            phase: "cancelled",
            downloaded: None,
            total: None,
            percent: None,
            current: None,
            count: None,
            message: Some(message.into()),
        }
    }
}

/// Install a frontend-driven cancellation listener and return a token.
fn setup_cancellation<R: Runtime>(app: &AppHandle<R>, event: &str) -> CancellationToken {
    let token = CancellationToken::new();
    let child = token.child_token();
    let cancel_event = format!("{}:cancel", event);
    app.listen(cancel_event, move |_evt| {
        child.cancel();
    });
    token
}

/// Clean up partial download / extraction artifacts on cancellation or error.
fn cleanup(archive: &Path, dest: &Path) {
    let _ = fs::remove_file(archive);
    let _ = fs::remove_dir_all(dest);
}

/// Returns true if the destination already contains a Vintage Story executable.
fn is_already_installed(dest: &Path) -> Result<bool, UiError> {
    if !dest.exists() {
        return Ok(false);
    }
    let exe_name = vintagestory_exe();
    for entry in walkdir::WalkDir::new(dest).into_iter().flatten() {
        if entry.file_type().is_file() {
            let fname = entry.file_name().to_string_lossy();
            if fname.eq_ignore_ascii_case(exe_name) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Returns true if the archive path looks like a zip file.
fn is_zip(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
}

/// Extract a filename from a Content-Disposition header, or fall back to the URL.
fn infer_filename(url: &str, headers: &reqwest::header::HeaderMap) -> String {
    if let Some(cd) = headers
        .get(CONTENT_DISPOSITION)
        .and_then(|cd| cd.to_str().ok())
    {
        if let Some(name) = cd.split(';').find_map(|part| {
            let part = part.trim();
            if part.starts_with("filename=") {
                Some(
                    part.trim_start_matches("filename=")
                        .trim_matches('"')
                        .to_string(),
                )
            } else {
                None
            }
        }) {
            if !name.is_empty() {
                return name;
            }
        }
    }

    url.split('/')
        .next_back()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "downloaded_file".to_string())
}

/// Stream a remote file to disk, returning the path to the saved archive.
async fn download_file<R: Runtime>(
    ctx: &DownloadContext<R>,
    client: &reqwest::Client,
    url: &str,
    dest_dir: &Path,
) -> Result<PathBuf, UiError> {
    let resp = client.get(url).send().await.map_err(|e| {
        log_error!("download: request error: {e}");
        UiError::from(format!("request error: {e}"))
    })?;

    if !resp.status().is_success() {
        return Err(UiError::from(format!("HTTP error: {}", resp.status())));
    }

    fs::create_dir_all(dest_dir).map_err(|e| {
        log_error!("download: create dir error: {e}");
        UiError::from(format!("create dir error: {e}"))
    })?;

    let filename = infer_filename(url, resp.headers());
    let archive_path = dest_dir.join(&filename);

    let total = resp.content_length();
    let mut file = File::create(&archive_path).map_err(|e| {
        log_error!("download: file create error: {e}");
        UiError::from(format!("file create error: {e}"))
    })?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if ctx.is_cancelled() {
            return Ok(archive_path);
        }

        let chunk = chunk.map_err(|e| UiError::from(format!("stream error: {e}")))?;
        file.write_all(&chunk)
            .map_err(|e| UiError::from(format!("file write error: {e}")))?;
        downloaded += chunk.len() as u64;

        let percent = total.map(|t| (downloaded as f64 / t as f64) * 100.0);
        ctx.emit(ProgressPayload {
            phase: "download",
            downloaded: Some(downloaded),
            total,
            percent,
            current: None,
            count: None,
            message: None,
        })?;
    }

    // Basic integrity check: if the server gave a Content-Length, verify it.
    if let Some(expected) = total {
        let actual = fs::metadata(&archive_path)
            .map(|m| m.len())
            .unwrap_or(downloaded);
        if actual != expected {
            return Err(UiError::from(format!(
                "download size mismatch: expected {expected} bytes, got {actual} bytes"
            )));
        }
    }

    Ok(archive_path)
}

/// Extract a zip archive to `extract_dir`, optionally stripping `prefix`.
async fn extract_zip<R: Runtime>(
    ctx: &DownloadContext<R>,
    archive: &Path,
    extract_dir: &Path,
    prefix: Option<&str>,
) -> Result<(), UiError> {
    let archive = archive.to_path_buf();
    let extract_dir = extract_dir.to_path_buf();
    let prefix = prefix.map(|s| s.to_string());
    let ctx_event = ctx.event.clone();
    let app = ctx.app.clone();
    let token = ctx.token.clone();

    tokio::task::spawn_blocking(move || {
        let ctx = DownloadContext {
            app,
            event: ctx_event,
            token,
        };
        extract_zip_sync(&ctx, &archive, &extract_dir, prefix.as_deref())
    })
    .await
    .map_err(|e| UiError::from(format!("spawn blocking error: {e}")))?
}

fn extract_zip_sync<R: Runtime>(
    ctx: &DownloadContext<R>,
    archive: &Path,
    extract_dir: &Path,
    prefix: Option<&str>,
) -> Result<(), UiError> {
    fs::create_dir_all(extract_dir)
        .map_err(|e| UiError::from(format!("create extract dir error: {e}")))?;

    let mut prefix = prefix.unwrap_or("").to_string();
    if !prefix.is_empty() && !prefix.ends_with('/') && !prefix.ends_with('\\') {
        prefix.push('/');
    }

    let file = File::open(archive).map_err(|e| UiError::from(format!("open zip error: {e}")))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| UiError::from(format!("zip open error: {e}")))?;

    let count_to_extract: u64 = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|e| e.name().to_string()))
        .filter(|name| should_extract(name, &prefix))
        .count() as u64;

    let mut processed: u64 = 0;
    for i in 0..archive.len() {
        if ctx.is_cancelled() {
            return Ok(());
        }

        let mut entry = archive
            .by_index(i)
            .map_err(|e| UiError::from(format!("zip index error: {e}")))?;
        let entry_name = entry.name().to_string();

        if !should_extract(&entry_name, &prefix) {
            continue;
        }

        let out_path = make_output_path(extract_dir, &entry_name, &prefix)
            .map_err(|e| UiError::from(format!("path error: {e}")))?;

        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| UiError::from(format!("mkdir error: {e}")))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| UiError::from(format!("mkdir parent error: {e}")))?;
            }
            let mut out_file = File::create(&out_path)
                .map_err(|e| UiError::from(format!("create file error: {e}")))?;
            io::copy(&mut entry, &mut out_file)
                .map_err(|e| UiError::from(format!("extract write error: {e}")))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    fs::set_permissions(&out_path, fs::Permissions::from_mode(mode)).ok();
                }
            }
        }

        processed += 1;
        let percent = if count_to_extract > 0 {
            Some((processed as f64 / count_to_extract as f64) * 100.0)
        } else {
            None
        };

        ctx.emit(ProgressPayload {
            phase: "extract",
            downloaded: None,
            total: None,
            percent,
            current: Some(processed),
            count: Some(count_to_extract),
            message: Some(format!("Extracted {}", entry_name)),
        })?;
    }

    Ok(())
}

/// Extract a tar archive (plain or gzip-compressed) to `extract_dir`.
async fn extract_tar<R: Runtime>(
    ctx: &DownloadContext<R>,
    archive: &Path,
    extract_dir: &Path,
) -> Result<(), UiError> {
    let archive = archive.to_path_buf();
    let extract_dir = extract_dir.to_path_buf();
    let ctx_event = ctx.event.clone();
    let app = ctx.app.clone();
    let token = ctx.token.clone();

    tokio::task::spawn_blocking(move || {
        let ctx = DownloadContext {
            app,
            event: ctx_event,
            token,
        };
        extract_tar_sync(&ctx, &archive, &extract_dir)
    })
    .await
    .map_err(|e| UiError::from(format!("spawn blocking error: {e}")))?
}

fn extract_tar_sync<R: Runtime>(
    ctx: &DownloadContext<R>,
    archive: &Path,
    extract_dir: &Path,
) -> Result<(), UiError> {
    fs::create_dir_all(extract_dir)
        .map_err(|e| UiError::from(format!("create extract dir error: {e}")))?;

    let file = File::open(archive).map_err(|e| UiError::from(format!("open tar error: {e}")))?;
    let reader = BufReader::new(file);

    // Detect gzip by extension.
    let is_gz = archive
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gz"))
        .unwrap_or(false)
        || archive
            .file_stem()
            .and_then(|s| Path::new(s).extension())
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("gz"))
            .unwrap_or(false);

    if is_gz {
        let decoder = flate2::read::GzDecoder::new(reader);
        extract_tar_archive(ctx, decoder, extract_dir)
    } else {
        extract_tar_archive(ctx, reader, extract_dir)
    }
}

fn extract_tar_archive<R: Runtime, Rdr: io::Read>(
    ctx: &DownloadContext<R>,
    reader: Rdr,
    extract_dir: &Path,
) -> Result<(), UiError> {
    let mut archive = tar::Archive::new(reader);
    let entries = archive
        .entries()
        .map_err(|e| UiError::from(format!("tar entries error: {e}")))?;

    let strip_components: usize = if cfg!(target_os = "macos") { 0 } else { 1 };

    for entry in entries {
        if ctx.is_cancelled() {
            return Ok(());
        }

        let mut entry = entry.map_err(|e| UiError::from(format!("tar entry error: {e}")))?;
        let path = entry
            .path()
            .map_err(|e| UiError::from(format!("tar path error: {e}")))?
            .to_path_buf();

        let mut components = path.components();
        for _ in 0..strip_components {
            let _ = components.next();
        }
        let stripped = components.as_path();

        if stripped.as_os_str().is_empty() {
            continue;
        }

        let out_path = extract_dir.join(stripped);

        // Zip-slip protection.
        let canon_base =
            dunce::canonicalize(extract_dir).unwrap_or_else(|_| extract_dir.to_path_buf());
        let canon_cand = dunce::canonicalize(&out_path).unwrap_or(out_path.clone());
        if !canon_cand.starts_with(&canon_base) {
            return Err(UiError::from("unsafe path in tar (zip slip)"));
        }

        entry
            .unpack(&out_path)
            .map_err(|e| UiError::from(format!("tar unpack error: {e}")))?;
    }

    Ok(())
}

#[command]
pub async fn download_and_maybe_extract<R: Runtime>(
    client: State<'_, Arc<reqwest::Client>>,
    app: tauri::AppHandle<R>,
    url: String,
    destpath: String,
    emitevent: String,
    extract: bool,
    extractdir: Option<String>,
    zipsubfolderprefix: Option<String>,
) -> Result<String, UiError> {
    let destpath = PathBuf::from(&destpath);
    log_info!("download: url={} dest={:?}", url, destpath);

    let token = setup_cancellation(&app, &emitevent);
    let ctx = DownloadContext {
        app: app.clone(),
        event: emitevent,
        token: token.clone(),
    };

    // Check if already installed (has vintagestory executable)
    if extract && destpath.exists() {
        if is_already_installed(&destpath)? {
            return Ok("already_downloaded".into());
        }
        fs::remove_dir_all(&destpath).map_err(|e| {
            UiError::from(format!("Failed to clean up incomplete installation: {e}"))
        })?;
    }

    // Download
    let archive_path = download_file(&ctx, &client, &url, &destpath).await?;

    if ctx.is_cancelled() {
        cleanup(&archive_path, &destpath);
        ctx.emit(DownloadContext::<R>::cancelled_payload(
            "Download cancelled",
        ))?;
        return Ok("cancelled".into());
    }

    // Extract
    if extract {
        let extract_dir = extractdir
            .ok_or_else(|| UiError::from("extract_dir must be provided when extract=true"))?;
        let extract_dir = PathBuf::from(extract_dir);

        if is_zip(&archive_path) {
            extract_zip(
                &ctx,
                &archive_path,
                &extract_dir,
                zipsubfolderprefix.as_deref(),
            )
            .await?;
        } else {
            extract_tar(&ctx, &archive_path, &extract_dir).await?;
        }

        if ctx.is_cancelled() {
            cleanup(&archive_path, &destpath);
            ctx.emit(DownloadContext::<R>::cancelled_payload(
                "Extraction cancelled",
            ))?;
            return Ok("cancelled".into());
        }

        fs::remove_file(&archive_path)
            .map_err(|e| UiError::from(format!("remove file error: {e}")))?;

        if !is_already_installed(&destpath)? {
            fs::remove_dir_all(&destpath).ok();
            return Err(UiError::from(
                "Could not find Vintage Story executable after extraction",
            ));
        }
    }

    ctx.emit(ProgressPayload {
        phase: "done",
        downloaded: None,
        total: None,
        percent: None,
        current: None,
        count: None,
        message: None,
    })?;

    Ok("success".into())
}

fn should_extract(entry_name: &str, prefix: &str) -> bool {
    if prefix.is_empty() {
        true
    } else {
        // Normalize to forward slashes
        let n = entry_name.replace('\\', "/");
        // On macOS, prefix is "*.app/" — match any <name>.app/ directory, not a literal "*"
        if prefix == "*.app/" {
            // Match if the first path component ends with ".app"
            if let Some(slash) = n.find('/') {
                n[..slash].ends_with(".app")
            } else {
                n.ends_with(".app")
            }
        } else {
            n.starts_with(prefix)
        }
    }
}

// Removes the prefix folder from entry_name and joins under extract_dir
fn make_output_path(base: &Path, entry_name: &str, prefix: &str) -> Result<PathBuf, String> {
    let normalized = entry_name.replace('\\', "/");
    let trimmed = if prefix.is_empty() {
        normalized.as_str()
    } else if let Some(stripped) = normalized.strip_prefix(prefix) {
        stripped
    } else {
        return Err("entry does not match prefix".into());
    };

    // Prevent zip slip: normalize and ensure the candidate stays inside base.
    let candidate = base.join(trimmed);
    let norm_base = normalize_path(base);
    let norm_candidate = normalize_path(&candidate);

    if !norm_candidate.starts_with(&norm_base) {
        return Err("unsafe path in zip (zip slip)".into());
    }
    Ok(candidate)
}

/// Normalize a path syntactically, resolving `.` and `..` without touching the
/// filesystem. Used for zip-slip checks before extraction.
fn normalize_path(path: &Path) -> PathBuf {
    use std::path::Component;

    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(p) => result.push(p.as_os_str()),
            Component::RootDir => result.push(component),
            Component::CurDir => {}
            Component::ParentDir => {
                if !result.pop() {
                    // Path escapes its root — preserve the marker so the caller
                    // can detect it as unsafe.
                    result.push("..");
                }
            }
            Component::Normal(name) => result.push(name),
        }
    }
    result
}

#[command]
pub async fn get_download_links(client: State<'_, Arc<reqwest::Client>>) -> Result<Value, UiError> {
    let res = client
        .get("https://vsapi.betterjs.dev/download")
        .send()
        .await
        .map_err(|e| {
            log_error!("download: Request error: {e}");
            UiError::from(format!("Request error: {e}"))
        })?
        .text()
        .await
        .map_err(|e| {
            log_error!("download: Read error: {e}");
            UiError::from(format!("Read error: {e}"))
        })?;
    let json: Value = serde_json::from_str(&res).map_err(|e| {
        log_error!("download: JSON parse error: {e}");
        UiError::from(format!("JSON parse error: {e}"))
    })?;
    Ok(json)
}

#[command]
pub async fn get_download_link(
    client: State<'_, Arc<reqwest::Client>>,
    version: &str,
) -> Result<String, UiError> {
    // if platform is macos it should say mac
    let mut platform = tauri_plugin_os::platform().replace("macos", "mac");
    let arch = tauri_plugin_os::arch();

    log_info!("platform: {platform}, arch: {arch}");

    // If platform is mac and their arch is arm64, set platform to mac-arm64
    if is_at_least_1_22_3(version).unwrap_or(false) && platform == "mac" && arch == "aarch64" {
        platform = "mac_arm64".to_string();
    }

    let url = format!(
        "https://vsapi.betterjs.dev/download/{}/{}/",
        version, platform
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| {
            log_error!("download: Request error: {e}");
            UiError::from(format!("Request error: {e}"))
        })?
        .text()
        .await
        .map_err(|e| {
            log_error!("download: Read error: {e}");
            UiError::from(format!("Read error: {e}"))
        })?;

    let json: serde_json::Value = serde_json::from_str(&res).map_err(|e| {
        log_error!("download: JSON parse error: {e}");
        UiError::from(format!("JSON parse error: {e}"))
    })?;
    if let Some(link) = json.get("url").and_then(|v| v.as_str()) {
        Ok(link.to_string())
    } else {
        Err(UiError::from("No download_url found in response"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_should_extract() {
        assert!(should_extract("file.txt", ""));
        assert!(should_extract("docs/file.txt", "docs/"));
        assert!(!should_extract("other/file.txt", "docs/"));
        assert!(should_extract("MyApp.app/Contents/MacOS/foo", "*.app/"));
        assert!(!should_extract("MyApp.apx/Contents/MacOS/foo", "*.app/"));
    }

    #[test]
    fn test_make_output_path_basic() {
        let base = PathBuf::from("/out");
        let path = make_output_path(&base, "docs/readme.txt", "docs/").unwrap();
        assert_eq!(path, PathBuf::from("/out/readme.txt"));
    }

    #[test]
    fn test_make_output_path_prevents_zip_slip() {
        let tmp = tempfile::tempdir().unwrap();
        let base = dunce::canonicalize(tmp.path()).unwrap();
        let result = make_output_path(&base, "../../../etc/passwd", "");
        assert!(result.is_err(), "zip-slip path should be rejected");
    }

    #[test]
    fn test_infer_filename() {
        let mut headers = reqwest::header::HeaderMap::new();
        assert_eq!(infer_filename("http://x/y.zip", &headers), "y.zip");

        headers.insert(
            CONTENT_DISPOSITION,
            reqwest::header::HeaderValue::from_static("attachment; filename=\"foo.tar.gz\""),
        );
        assert_eq!(infer_filename("http://x/y.zip", &headers), "foo.tar.gz");
    }
}
