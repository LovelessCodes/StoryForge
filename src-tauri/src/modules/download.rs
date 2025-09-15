use futures_util::StreamExt;
use reqwest::header::CONTENT_DISPOSITION;
use serde::Serialize;
use serde_json::Value;
use std::{
    fs::{self, File},
    io::{self, Seek, Write},
    path::{Path, PathBuf},
    process::Command,
};
use reqwest::get;
use tauri::{command, Emitter, Runtime};

use super::errors::UiError;

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    phase: &'static str, // "download" | "extract"
    downloaded: Option<u64>,
    total: Option<u64>,
    percent: Option<f64>,
    current: Option<u64>, // for extract: files processed
    count: Option<u64>,   // for extract: total files considered
    message: Option<String>,
}

#[command]
pub async fn download_and_maybe_extract<R: Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
    destpath: String,  // where the .zip (or any file) is saved
    emitevent: String, // base event, e.g. "download://job/123"
    // extraction controls
    extract: bool,
    // where to extract if extract == true
    extractdir: Option<String>,
    // only extract entries whose path starts with this folder inside the zip, e.g. "docs/".
    // Use "" or None to extract all
    zipsubfolderprefix: Option<String>,
) -> Result<String, UiError> {
    // 1) Download
    let resp = get(&url)
        .await
        .map_err(|e| format!("request error: {e}"))?;

    // Get the filename from Content-Disposition or fallback
    // Content-Disposition: attachment; filename="example.pdf"
    let filename = resp
        .headers()
        .get(CONTENT_DISPOSITION)
        .and_then(|cd| cd.to_str().ok())
        .and_then(|cd_str| {
            cd_str
                .split(';')
                .find_map(|part| {
                    let part = part.trim();
                    if part.starts_with("filename=") {
                        Some(part.trim_start_matches("filename=").trim_matches('"'))
                    } else {
                        None
                    }
                })
        })
        .unwrap_or_else(|| {
            url.split('/')
                .last()
                .unwrap_or(if cfg!(target_os = "windows") {
                    "downloaded_file.zip"
                } else {
                    "downloaded_file.tar.gz"
                })
        });

    let filepathbuf = PathBuf::from(&destpath).join(filename);
    let filepath = Path::new(&filepathbuf);

    if !resp.status().is_success() {
        return Err(UiError::from(format!("HTTP error: {}", resp.status())));
    }

    let destpath = PathBuf::from(&destpath);
    if !destpath.exists() {
        fs::create_dir_all(&destpath)
            .map_err(|e| UiError::from(format!("create dir error: {e}")))?;
    }

    let total = resp.content_length();
    let mut file =
        File::create(&filepath).map_err(|e| UiError::from(format!("file create error: {e}")))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("file write error: {e}"))?;
        downloaded += chunk.len() as u64;

        let percent = total.map(|t| (downloaded as f64 / t as f64) * 100.0);
        app
            .emit(
                &emitevent,
                ProgressPayload {
                    phase: "download",
                    downloaded: Some(downloaded),
                    total,
                    percent,
                    current: None,
                    count: None,
                    message: None,
                },
            )
            .map_err(|e| format!("emit error: {e}"))?;
    }

    // Optionally extract ZIP content
    if extract {
        // if .zip filepath
        if filepath
            .extension()
            .and_then(|s| s.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("zip"))
            .unwrap_or(false)
        {
            let extract_dir = extractdir
                .ok_or_else(|| "extract_dir must be provided when extract=true".to_string())?;
            let extract_dir = PathBuf::from(extract_dir);
            fs::create_dir_all(&extract_dir).map_err(|e| format!("create extract dir error: {e}"))?;

            let mut zip_file = File::open(&filepath).map_err(|e| format!("open zip error: {e}"))?;
            zip_file
                .rewind()
                .map_err(|e| UiError::from(format!("rewind error: {e}")))?;

            let mut archive = zip::ZipArchive::new(zip_file)
                .map_err(|e| UiError::from(format!("zip open error: {e}")))?;

            // Normalize the prefix (folder inside zip)
            let mut prefix = zipsubfolderprefix.unwrap_or_default();
            if !prefix.is_empty() && !prefix.ends_with('/') && !prefix.ends_with('\\') {
                prefix.push('/');
            }

            // First pass: count entries to extract for progress
            let mut count_to_extract: u64 = 0;
            for i in 0..archive.len() {
                let entry = archive
                    .by_index(i)
                    .map_err(|e| UiError::from(format!("zip index error: {e}")))?;
                let entry_name = entry.name();
                if should_extract(entry_name, &prefix) {
                    count_to_extract += 1;
                }
            }

            // Second pass: extract
            let mut processed: u64 = 0;
            // Reopen archive to reset cursor (simplest)
            let mut zip_file =
                File::open(&filepath).map_err(|e| UiError::from(format!("open zip error: {e}")))?;
            let mut archive = zip::ZipArchive::new(&mut zip_file)
                .map_err(|e| UiError::from(format!("zip open error: {e}")))?;

            for i in 0..archive.len() {
                let mut entry = archive
                    .by_index(i)
                    .map_err(|e| UiError::from(format!("zip index error: {e}")))?;
                let entry_name = entry.name().to_string();

                if !should_extract(&entry_name, &prefix) {
                    continue;
                }

                let out_path = make_output_path(&extract_dir, &entry_name, &prefix)
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
                    // Preserve unix permissions if present
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

                app
                    .emit(
                        &emitevent,
                        ProgressPayload {
                            phase: "extract",
                            downloaded: None,
                            total: None,
                            percent,
                            current: Some(processed),
                            count: Some(count_to_extract),
                            message: Some(format!("Extracted {}", entry_name)),
                        },
                    )
                    .map_err(|e| UiError::from(format!("emit error: {e}")))?;
            }
            // Remove the downloaded archive after extraction
            fs::remove_file(&filepath).map_err(|e| UiError::from(format!("remove file error: {e}")))?;
            // Traverse the destination path and try to find Vintagestory executable
            let mut found_exe = false;
            for entry in walkdir::WalkDir::new(&destpath) {
                let entry = entry.map_err(|e| UiError::from(format!("walkdir error: {e}")))?;
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy();
                    if fname.eq_ignore_ascii_case("vintagestory.exe")
                    {
                        found_exe = true;
                        break;
                    }
                }
            }
            if !found_exe {
                // Delete the destination path if extraction failed
                fs::remove_dir_all(&destpath).ok();
                return Err(UiError::from("Could not find Vintage Story executable after extraction"));
            }
        } else {
            fs::create_dir_all(&destpath).map_err(|e| UiError::from(format!("create dir error: {e}")))?;
            let destpath_str = destpath.to_str().unwrap();
            let mut args = vec![
                "--strip-components",
                "1",
                "-xvf",
                filepath.to_str().unwrap(),
                "-C",
                destpath_str,
            ];
            if let Some(sp) = zipsubfolderprefix.as_deref() {
                if !sp.trim_matches('/').to_string().is_empty() {
                    args.push(sp);
                }
            }

            app
                .emit(
                    &emitevent,
                    ProgressPayload {
                        phase: "extract",
                        downloaded: None,
                        total: None,
                        percent: None,
                        current: None,
                        count: None,
                        message: None,
                    },
                )
                .map_err(|e| UiError::from(format!("emit error: {e}")))?;
            let status = Command::new(if cfg!(target_os = "macos") {
                "bsdtar"
            } else {
                "tar"
            })
                .args(&args)
                .status()
                .map_err(|e| UiError::from(format!("tar error: {e}")))?;
            if !status.success() {
                return Err(UiError::from("tar failed"));
            }
            // Remove the downloaded archive after extraction
            fs::remove_file(&filepath).map_err(|e| UiError::from(format!("remove file error: {e}")))?;

            // Traverse the destination path and try to find Vintagestory executable
            let mut found_exe = false;
            for entry in walkdir::WalkDir::new(&destpath) {
                let entry = entry.map_err(|e| UiError::from(format!("walkdir error: {e}")))?;
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy();
                    if fname.eq_ignore_ascii_case("vintagestory") || fname.eq_ignore_ascii_case("vintagestory.exe") {
                        found_exe = true;
                        break;
                    }
                }
            }
            if !found_exe {
                // Delete the destination path if extraction failed
                fs::remove_dir_all(&destpath).ok();
                return Err(UiError::from("Could not find Vintage Story executable after extraction"));
            }
        }
    }

    // Done
    app
        .emit(
            &format!("{emitevent}/done"),
            serde_json::json!({ "path": destpath }),
        )
        .map_err(|e| format!("emit error: {e}"))?;

    Ok("success".into())
}

fn should_extract(entry_name: &str, prefix: &str) -> bool {
    if prefix.is_empty() {
        true
    } else {
        // Normalize to forward slashes
        let n = entry_name.replace('\\', "/");
        n.starts_with(prefix)
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

    // Prevent zip slip: disallow path traversal
    let candidate = base.join(trimmed);
    let canon_base = dunce::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    let canon_cand = dunce::canonicalize(&candidate).unwrap_or(candidate.clone());

    if !canon_cand.starts_with(&canon_base) {
        return Err("unsafe path in zip (zip slip)".into());
    }
    Ok(candidate)
}

#[command]
pub async fn get_download_links() -> Result<Value, UiError> {
    let res = reqwest::get("https://vsapi.betterjs.dev/download")
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;
    let json: Value =
        serde_json::from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn get_download_link(version: &str) -> Result<String, UiError> {
    // if platform is macos it should say mac
    let platform = tauri_plugin_os::platform().replace("macos", "mac");
    let url = format!(
        "https://vsapi.betterjs.dev/download/{}/{}/",
        version, platform
    );
    let res = get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: serde_json::Value =
        serde_json::from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    if let Some(link) = json.get("url").and_then(|v| v.as_str()) {
        Ok(link.to_string())
    } else {
        Err(UiError::from("No download_url found in response"))
    }
}
