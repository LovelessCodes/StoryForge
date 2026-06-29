use futures_util::StreamExt;
use reqwest::header::CONTENT_DISPOSITION;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, BufReader, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
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

/// Manifest written next to a partial file when a download is paused, enabling resume.
#[derive(Serialize, Deserialize, Clone)]
struct ResumeManifest {
    offset: u64,
    etag: String,
    url: String,
    filepath: String,
}

/// Tracks an in-flight download so it can be paused on app exit.
struct ActiveDownload {
    pause_flag: Arc<AtomicBool>,
    /// The last known offset — updated by the download loop on each chunk.
    stored_offset: Arc<AtomicU64>,
    /// Snapshot of the manifest fields needed to write a `.resume.json` on exit.
    url: String,
    filepath: String,
    etag: Arc<Mutex<String>>,
}

/// Global registry of active downloads, keyed by event name.
static ACTIVE_DOWNLOADS: OnceLock<Mutex<HashMap<String, ActiveDownload>>> = OnceLock::new();

fn active_downloads() -> &'static Mutex<HashMap<String, ActiveDownload>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drop guard that removes a download from the global registry on any exit path.
struct UnregisterOnDrop {
    event: String,
}

impl Drop for UnregisterOnDrop {
    fn drop(&mut self) {
        active_downloads().lock().unwrap().remove(&self.event);
    }
}

/// Called from `lib.rs` on `RunEvent::Exit` — pauses all in-flight downloads so they
/// can be resumed after restart.
pub fn pause_all_active_downloads() {
    let map = active_downloads();
    let entries: Vec<_> = {
        let guard = map.lock().unwrap();
        guard
            .iter()
            .map(|(event, ad)| {
                (
                    event.clone(),
                    ad.pause_flag.clone(),
                    ad.stored_offset.load(Ordering::SeqCst),
                    ad.url.clone(),
                    ad.filepath.clone(),
                    ad.etag.lock().unwrap().clone(),
                )
            })
            .collect()
    };

    if entries.is_empty() {
        return;
    }

    log_info!("Shutdown: pausing {} active download(s)", entries.len());

    for (event, flag, offset, url, filepath, etag) in &entries {
        // Signal the download loop to stop
        flag.store(true, Ordering::SeqCst);

        // Write the resume manifest directly in case the loop can't react in time
        let manifest = ResumeManifest {
            offset: *offset,
            etag: etag.clone(),
            url: url.clone(),
            filepath: filepath.clone(),
        };
        let manifest_path = manifest_path_for(Path::new(filepath));
        if let Ok(json) = serde_json::to_string(&manifest) {
            let _ = std::fs::write(&manifest_path, &json);
            log_info!(
                "Shutdown: paused download '{}' (offset {}) → {}",
                event,
                offset,
                manifest_path.display()
            );
        }
    }
}

/// Info returned to the frontend for a paused download found on disk.
#[derive(Serialize, Clone)]
pub struct PausedDownload {
    pub label: String,
    pub offset: u64,
    pub url: String,
    pub filepath: String,
}

/// Context shared by the download and extraction helpers.
struct DownloadContext<R: Runtime> {
    app: AppHandle<R>,
    event: String,
    token: CancellationToken,
    pause_flag: Arc<AtomicBool>,
    stored_offset: Arc<AtomicU64>,
    stored_etag: Arc<Mutex<String>>,
}

impl<R: Runtime> DownloadContext<R> {
    fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    fn is_paused(&self) -> bool {
        self.pause_flag.load(Ordering::SeqCst)
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

/// Install frontend-driven cancellation AND pause listeners, returning a token and pause flag.
fn setup_controls<R: Runtime>(
    app: &AppHandle<R>,
    event: &str,
) -> (CancellationToken, Arc<AtomicBool>) {
    let token = CancellationToken::new();
    let cancel_token = token.child_token();
    let pause_flag = Arc::new(AtomicBool::new(false));

    let cancel_event = format!("{}:cancel", event);
    let cancel_token_for_listener = cancel_token.clone();
    app.listen(cancel_event, move |_evt| {
        cancel_token_for_listener.cancel();
    });

    let pause_flag_clone = pause_flag.clone();
    let pause_event = format!("{}:pause", event);
    app.listen(pause_event, move |_evt| {
        pause_flag_clone.store(true, Ordering::SeqCst);
    });

    (cancel_token, pause_flag)
}

/// Path to the resume manifest for a given archive file.
fn manifest_path_for(archive: &Path) -> PathBuf {
    let mut s = archive.to_string_lossy().to_string();
    s.push_str(".resume.json");
    PathBuf::from(s)
}

/// Read a resume manifest if one exists alongside a partial download.
fn read_resume_manifest(archive: &Path) -> Option<ResumeManifest> {
    let path = manifest_path_for(archive);
    let data = fs::read_to_string(&path).ok()?;
    let manifest: ResumeManifest = serde_json::from_str(&data).ok()?;
    Some(manifest)
}

/// Clean up partial download / extraction artifacts on cancellation or error.
fn cleanup(archive: &Path, dest: &Path) {
    let _ = fs::remove_file(archive);
    let _ = fs::remove_dir_all(dest);
    let _ = fs::remove_file(manifest_path_for(archive));
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
/// When `resume_offset > 0`, sends a `Range` header and appends to the existing partial file.
/// Returns `Ok(archive_path)` on completion, `Ok(("<paused>", archive_path))` on pause.
async fn download_file<R: Runtime>(
    ctx: &DownloadContext<R>,
    client: &reqwest::Client,
    url: &str,
    dest_dir: &Path,
    resume_offset: u64,
) -> Result<PathBuf, UiError> {
    let mut req = client.get(url);

    if resume_offset > 0 {
        req = req.header("Range", format!("bytes={}-", resume_offset));
    }

    let resp = req.send().await.map_err(|e| {
        log_error!("download: request error: {e}");
        UiError::from(format!("request error: {e}"))
    })?;

    if resume_offset > 0 {
        if resp.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err(UiError::from(format!(
                "server did not return 206 Partial Content for resume (got {})",
                resp.status()
            )));
        }
    } else if !resp.status().is_success() {
        return Err(UiError::from(format!("HTTP error: {}", resp.status())));
    }

    fs::create_dir_all(dest_dir).map_err(|e| {
        log_error!("download: create dir error: {e}");
        UiError::from(format!("create dir error: {e}"))
    })?;

    let filename = infer_filename(url, resp.headers());
    let archive_path = dest_dir.join(&filename);
    let etag = resp
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Update the shared etag so pause_all_active_downloads has the latest value.
    *ctx.stored_etag.lock().unwrap() = etag.clone();

    let total = resp.content_length().map(|t| t + resume_offset);
    let mut file = if resume_offset > 0 {
        File::options()
            .append(true)
            .open(&archive_path)
            .map_err(|e| UiError::from(format!("file append error: {e}")))?
    } else {
        File::create(&archive_path).map_err(|e| {
            log_error!("download: file create error: {e}");
            UiError::from(format!("file create error: {e}"))
        })?
    };

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = resume_offset;

    while let Some(chunk) = stream.next().await {
        if ctx.is_cancelled() {
            return Ok(archive_path);
        }

        if ctx.is_paused() {
            // Write the progress so far, then save resume manifest.
            let manifest = ResumeManifest {
                offset: downloaded,
                etag,
                url: url.to_string(),
                filepath: archive_path.to_string_lossy().to_string(),
            };
            let manifest_path = manifest_path_for(&archive_path);
            let manifest_json = serde_json::to_string(&manifest)
                .map_err(|e| UiError::from(format!("resume manifest serialize: {e}")))?;
            fs::write(&manifest_path, &manifest_json)
                .map_err(|e| UiError::from(format!("resume manifest write: {e}")))?;
            log_info!(
                "download paused at offset {} → {}",
                downloaded,
                manifest_path.display()
            );
            return Ok(archive_path);
        }

        let chunk = chunk.map_err(|e| UiError::from(format!("stream error: {e}")))?;
        file.write_all(&chunk)
            .map_err(|e| UiError::from(format!("file write error: {e}")))?;
        downloaded += chunk.len() as u64;

        // Keep the global registry in sync for pause-on-exit.
        ctx.stored_offset.store(downloaded, Ordering::SeqCst);

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

    // Done — remove any stale resume manifest.
    let _ = fs::remove_file(manifest_path_for(&archive_path));

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
    // Signal extraction start from the async context so the frontend gets it reliably.
    ctx.emit(ProgressPayload {
        phase: "extract",
        downloaded: None,
        total: None,
        percent: Some(0.0),
        current: Some(0),
        count: None,
        message: None,
    })?;

    let archive = archive.to_path_buf();
    let extract_dir = extract_dir.to_path_buf();
    let prefix = prefix.map(|s| s.to_string());
    let ctx_event = ctx.event.clone();
    let app = ctx.app.clone();
    let token = ctx.token.clone();
    let pause_flag = ctx.pause_flag.clone();
    let stored_offset = ctx.stored_offset.clone();
    let stored_etag = ctx.stored_etag.clone();

    tokio::task::spawn_blocking(move || {
        let ctx = DownloadContext {
            app,
            event: ctx_event,
            token,
            pause_flag,
            stored_offset,
            stored_etag,
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
    // Signal extraction start from the async context so the frontend gets it reliably.
    ctx.emit(ProgressPayload {
        phase: "extract",
        downloaded: None,
        total: None,
        percent: Some(0.0),
        current: Some(0),
        count: None,
        message: None,
    })?;

    let archive = archive.to_path_buf();
    let extract_dir = extract_dir.to_path_buf();
    let ctx_event = ctx.event.clone();
    let app = ctx.app.clone();
    let token = ctx.token.clone();
    let pause_flag = ctx.pause_flag.clone();
    let stored_offset = ctx.stored_offset.clone();
    let stored_etag = ctx.stored_etag.clone();

    tokio::task::spawn_blocking(move || {
        let ctx = DownloadContext {
            app,
            event: ctx_event,
            token,
            pause_flag,
            stored_offset,
            stored_etag,
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

    let (token, pause_flag) = setup_controls(&app, &emitevent);

    // Determine the archive filename from the URL.
    let filename_hint = url.split('/').next_back().unwrap_or("downloaded_file");
    let candidate_path = destpath.join(filename_hint);

    // Check for a resume manifest.
    let resume_offset: u64 = if let Some(m) = read_resume_manifest(&candidate_path) {
        if m.url == url {
            log_info!(
                "download: resuming {} from offset {}",
                filename_hint,
                m.offset
            );
            m.offset
        } else {
            log_info!("download: url mismatch in resume manifest, starting fresh");
            let _ = fs::remove_file(&candidate_path);
            let _ = fs::remove_file(manifest_path_for(&candidate_path));
            0
        }
    } else {
        0
    };

    // Build the shared tracking state so pause_all_active_downloads can write manifests on exit.
    let stored_offset = Arc::new(AtomicU64::new(resume_offset));
    let stored_etag = Arc::new(Mutex::new(String::new()));

    // Register in the global registry.
    {
        let mut reg = active_downloads().lock().unwrap();
        reg.insert(
            emitevent.clone(),
            ActiveDownload {
                pause_flag: pause_flag.clone(),
                stored_offset: stored_offset.clone(),
                url: url.clone(),
                filepath: candidate_path.to_string_lossy().to_string(),
                etag: stored_etag.clone(),
            },
        );
    }
    // Drop guard removes the entry on any exit path (success, error, pause, cancellation).
    let _unregister = UnregisterOnDrop {
        event: emitevent.clone(),
    };

    let ctx = DownloadContext {
        app: app.clone(),
        event: emitevent.clone(),
        token: token.clone(),
        pause_flag: pause_flag.clone(),
        stored_offset,
        stored_etag,
    };

    // Fresh download setup (only needed when not resuming).
    if resume_offset == 0 {
        if extract && destpath.exists() {
            if is_already_installed(&destpath)? {
                return Ok("already_downloaded".into());
            }
            fs::remove_dir_all(&destpath).map_err(|e| {
                UiError::from(format!("Failed to clean up incomplete installation: {e}"))
            })?;
        }
        fs::create_dir_all(&destpath).map_err(|e| {
            log_error!("download: create dir error: {e}");
            UiError::from(format!("create dir error: {e}"))
        })?;
    }

    let archive_path = download_file(&ctx, &client, &url, &destpath, resume_offset).await?;

    // Check if paused (non-cleanup exit, partial file + manifest preserved)
    if ctx.is_paused() {
        ctx.emit(ProgressPayload {
            phase: "paused",
            downloaded: None,
            total: None,
            percent: None,
            current: None,
            count: None,
            message: None,
        })?;
        return Ok("paused".into());
    }

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

/// Scan a directory for orphaned `.resume.json` files and return the paused downloads.
#[command]
pub fn scan_resume_manifests(dirs: Vec<String>) -> Vec<PausedDownload> {
    let mut paused = Vec::new();

    for dir in dirs {
        let path = PathBuf::from(&dir);
        if !path.exists() || !path.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(&path) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let entry_path = entry.path();
            if !entry_path.is_dir() {
                continue;
            }

            // Look for .resume.json files inside each version directory
            let dir_entries = match fs::read_dir(&entry_path) {
                Ok(e) => e,
                Err(_) => continue,
            };

            for file_entry in dir_entries.flatten() {
                let file_path = file_entry.path();
                let fname = file_path.to_string_lossy().to_string();

                if !fname.ends_with(".resume.json") {
                    continue;
                }

                if let Some(manifest) = read_resume_manifest_for_path(&file_path) {
                    let label = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    paused.push(PausedDownload {
                        label,
                        offset: manifest.offset,
                        url: manifest.url,
                        filepath: manifest.filepath,
                    });
                }
            }
        }
    }

    paused
}

/// Read a resume manifest from a specific path (not inferred from the archive path).
fn read_resume_manifest_for_path(path: &Path) -> Option<ResumeManifest> {
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
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
