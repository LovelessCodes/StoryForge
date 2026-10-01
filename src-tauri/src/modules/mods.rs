use json5::from_str as json5_from_str;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, Value};
use std::{
    fs::{create_dir_all, read_dir, remove_file, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, State};
use zip::read::ZipArchive;

use super::errors::UiError;
use super::paths;
use super::profiles::find_profile_by_id;
use super::utils::{lock, require_managed_path, safe_file_name, safe_join};
use crate::{log_error, log_info};

#[derive(Debug, Clone, Deserialize)]
pub struct ModRemoveParams {
    pub path: String,
    pub modpath: String,
}

#[derive(Debug, Deserialize)]
struct ModRelease {
    mainfile: String,
    modversion: String,
}

#[derive(Debug, Deserialize)]
struct ModDetail {
    releases: Vec<ModRelease>,
}

#[derive(Debug, Deserialize)]
struct ModInfoResponse {
    #[serde(rename = "mod")]
    mod_: ModDetail,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FetchModsParams {
    pub versions: Vec<String>,
    pub search: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Mod {
    pub modid: i64,
    pub assetid: i64,
    pub downloads: i64,
    pub follows: i64,
    pub trendingpoints: i64,
    pub comments: i64,
    pub name: String,
    pub summary: String,
    pub modidstrs: Vec<String>,
    pub author: String,
    pub urlalias: Option<String>,
    pub side: String,
    pub r#type: String,
    pub logo: Option<String>,
    pub tags: Vec<String>,
    pub lastreleased: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModsResponse {
    statuscode: String,
    mods: Vec<Mod>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModTags {
    pub tagid: Value,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModTagsResponse {
    statuscode: String,
    tags: Vec<ModTags>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputMod {
    pub modid: String,
    pub name: String,
    pub authors: Vec<String>,
    pub version: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModsResult {
    pub mods: Vec<OutputMod>,
    pub errors: Vec<ModError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModError {
    pub file: String,    // the .zip path (or entry path)
    pub stage: String,   // e.g. "read_dir", "open_zip", "read_entry", "parse_json"
    pub message: String, // human-readable details
}

#[command]
pub async fn fetch_mod_tags(
    client: State<'_, Arc<reqwest::Client>>,
) -> Result<Vec<ModTags>, UiError> {
    let res = client
        .get("https://mods.vintagestory.at/api/tags")
        .send()
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<ModTagsResponse>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;

    Ok(json.tags)
}

#[command]
pub async fn fetch_mods(
    client: State<'_, Arc<reqwest::Client>>,
    options: FetchModsParams,
) -> Result<Vec<Mod>, UiError> {
    let mut params = Vec::new();
    if !options.versions.is_empty() {
        for version in options.versions {
            params.push(("gameversions[]".to_string(), version.to_string()));
        }
    }
    if !options.search.is_empty() {
        params.push(("text".to_string(), options.search.clone()));
    }

    let res = client
        .get("https://mods.vintagestory.at/api/mods")
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<ModsResponse>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;
    Ok(json.mods)
}

#[command]
pub async fn fetch_mod_info(
    client: State<'_, Arc<reqwest::Client>>,
    modid: String,
) -> Result<Value, UiError> {
    let url = format!("https://mods.vintagestory.at/api/mod/{}", modid);
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::new("io_error", format!("Read error: {e}")))?;

    let json: Value = from_str(&res)
        .map_err(|e| UiError::new("parse_error", format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn fetch_authors(
    client: State<'_, Arc<reqwest::Client>>,
    search: String,
) -> Result<Value, UiError> {
    let url = format!(
        "https://mods.vintagestory.at/api/v2/users/by-name/{}?contributors-only=true",
        search
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::new("io_error", format!("Read error: {e}")))?;

    let json: Value = from_str(&res)
        .map_err(|e| UiError::new("parse_error", format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn add_mod_to_profile(
    client: State<'_, Arc<reqwest::Client>>,
    app: AppHandle,
    path: String,
    url: String,
) -> Result<String, UiError> {
    log_info!("add_mod_to_profile: {:?}", path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let pb = PathBuf::from(path).join(paths::MODS_DIR);
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Request error: {e}")))?;
    if !response.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", response.status()),
        });
    }
    let filename = url
        .split('=')
        .next_back()
        .ok_or_else(|| UiError::from("Invalid URL"))?;
    let filename = safe_file_name(filename)?;
    let filepath = pb.join(&filename);
    let mut file = File::create(&filepath).map_err(|e| UiError {
        name: "create_file_failed".into(),
        message: format!("Failed to create file: {e}"),
    })?;
    let content = response.bytes().await.map_err(|e| UiError {
        name: "read_response_failed".into(),
        message: format!("Failed to read response: {e}"),
    })?;
    file.write_all(&content).map_err(|e| UiError {
        name: "write_file_failed".into(),
        message: format!("Failed to write file: {e}"),
    })?;
    invalidate_mods_cache(&pb);
    Ok("added".into())
}

#[command]
pub async fn download_mod(
    client: State<'_, Arc<reqwest::Client>>,
    modid: String,
    version: String,
    profile_path: String,
) -> Result<String, UiError> {
    let mods_dir = PathBuf::from(&profile_path).join(paths::MODS_DIR);
    download_mod_file(&client, &modid, &version, &mods_dir).await
}

/// Download a mod by modid + version into a Mods directory.
/// Returns the saved filename.
pub async fn download_mod_file(
    client: &reqwest::Client,
    modid: &str,
    version: &str,
    mods_dir: &Path,
) -> Result<String, UiError> {
    log_info!(
        "download_mod_file: modid={} version={} dir={:?}",
        modid,
        version,
        mods_dir
    );

    // 1. Fetch mod info to get the download URL for the given version
    let url = format!("https://mods.vintagestory.at/api/mod/{}", modid);
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Request error: {e}")))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let mod_info: ModInfoResponse = res
        .json()
        .await
        .map_err(|e| UiError::new("parse_error", format!("JSON error: {e}")))?;

    // 2. Find the release matching the requested version
    let release = mod_info
        .mod_
        .releases
        .iter()
        .find(|r| r.modversion == version)
        .ok_or_else(|| UiError {
            name: "version_not_found".into(),
            message: format!("No release found for version {}", version),
        })?;

    let download_url = &release.mainfile;
    log_info!("download_mod_file: download_url={}", download_url);

    // 3. Ensure Mods directory exists
    if !mods_dir.exists() {
        create_dir_all(mods_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create Mods directory: {e}"),
        })?;
    }

    // 4. Download the mod file
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Download request error: {e}")))?;

    if !response.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("Download HTTP error: {}", response.status()),
        });
    }

    // Extract filename from URL or Content-Disposition
    let filename = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|cd| cd.to_str().ok())
        .and_then(|cd_str| {
            cd_str.split(';').find_map(|part| {
                let part = part.trim();
                part.strip_prefix("filename=").map(|f| f.trim_matches('"'))
            })
        })
        .unwrap_or_else(|| download_url.split('/').next_back().unwrap_or("mod.zip"))
        .to_string();
    // The name comes from the remote server; reduce it to a single component
    // so it cannot escape the Mods directory.
    let filename = safe_file_name(&filename)?;

    let filepath = mods_dir.join(&filename);
    let content = response.bytes().await.map_err(|e| UiError {
        name: "read_response_failed".into(),
        message: format!("Failed to read response: {e}"),
    })?;

    let mut file = File::create(&filepath).map_err(|e| UiError {
        name: "create_file_failed".into(),
        message: format!("Failed to create file: {e}"),
    })?;

    file.write_all(&content).map_err(|e| UiError {
        name: "write_file_failed".into(),
        message: format!("Failed to write file: {e}"),
    })?;

    log_info!("download_mod_file: saved to {:?}", filepath);
    invalidate_mods_cache(mods_dir);
    Ok(filename)
}

// ── Mods scan cache ──
// Opening every zip and parsing modinfo.json is the expensive part of the
// mods list; result entries are keyed by a fingerprint of the zip files.

struct ModsCacheEntry {
    fingerprint: u64,
    result: ModsResult,
}

type ModsCacheMap = std::collections::HashMap<PathBuf, ModsCacheEntry>;

static MODS_CACHE: std::sync::LazyLock<std::sync::Mutex<ModsCacheMap>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// Cheap fingerprint of a Mods directory: path, mtime and size of every zip.
fn mods_fingerprint(mods_dir: &Path) -> Option<u64> {
    use std::hash::{Hash, Hasher};

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    mods_dir.hash(&mut hasher);
    let mut count: u64 = 0;
    for entry in read_dir(mods_dir).ok()?.flatten() {
        let path = entry.path();
        let is_zip = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
        if !is_zip {
            continue;
        }
        path.hash(&mut hasher);
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(d) = modified.duration_since(std::time::UNIX_EPOCH) {
                    d.as_secs().hash(&mut hasher);
                    d.subsec_nanos().hash(&mut hasher);
                }
            }
            meta.len().hash(&mut hasher);
        }
        count += 1;
    }
    count.hash(&mut hasher);
    Some(hasher.finish())
}

fn try_cached_mods(mods_dir: &Path) -> Option<ModsResult> {
    let fingerprint = mods_fingerprint(mods_dir)?;
    let cache = lock(&MODS_CACHE);
    let entry = cache.get(mods_dir)?;
    (entry.fingerprint == fingerprint).then(|| entry.result.clone())
}

fn store_mods_cache(mods_dir: &Path, result: &ModsResult) {
    if let Some(fingerprint) = mods_fingerprint(mods_dir) {
        lock(&MODS_CACHE).insert(
            mods_dir.to_path_buf(),
            ModsCacheEntry {
                fingerprint,
                result: result.clone(),
            },
        );
    }
}

/// Drops cached scan results for `prefix` and everything below it.
fn invalidate_mods_cache(prefix: &Path) {
    lock(&MODS_CACHE).retain(|path, _| !path.starts_with(prefix));
}

/// Scans a Mods directory, reusing a cached result while the zips are unchanged.
fn get_mods_cached(mods_dir: &Path) -> Result<ModsResult, UiError> {
    if let Some(cached) = try_cached_mods(mods_dir) {
        return Ok(cached);
    }
    let result = get_mods_in_dir(mods_dir)?;
    store_mods_cache(mods_dir, &result);
    Ok(result)
}

// ── modinfo.json helpers ──

/// Find a field in a `modinfo.json` value using a case-insensitive key match.
fn modinfo_field<'v>(value: &'v Value, key: &str) -> Option<&'v Value> {
    value
        .as_object()
        .and_then(|obj| obj.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)))
        .map(|(_, v)| v)
}

fn modinfo_string(value: &Value, key: &str) -> Option<String> {
    modinfo_field(value, key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn modinfo_string_array(value: &Value, key: &str) -> Vec<String> {
    modinfo_field(value, key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn modinfo_modid(value: &Value) -> String {
    modinfo_field(value, "modid")
        .map(|v| {
            if let Some(s) = v.as_str() {
                s.to_string()
            } else if let Some(n) = v.as_i64() {
                n.to_string()
            } else if let Some(n) = v.as_u64() {
                n.to_string()
            } else if let Some(n) = v.as_f64() {
                if n.fract() == 0.0 {
                    (n as i64).to_string()
                } else {
                    n.to_string()
                }
            } else {
                "0".to_string()
            }
        })
        .unwrap_or_else(|| "0".to_string())
}

/// Try to read a single `modinfo.json` entry from an already-opened zip archive.
fn read_modinfo_from_zip(
    zip_path: &Path,
    archive: &mut ZipArchive<File>,
    errors: &mut Vec<ModError>,
) -> (Option<OutputMod>, bool) {
    let mut saw_modinfo = false;
    for i in 0..archive.len() {
        let mut file_in_zip = match archive.by_index(i) {
            Ok(f) => f,
            Err(e) => {
                errors.push(ModError {
                    file: zip_path.to_string_lossy().into_owned(),
                    stage: "read_entry".into(),
                    message: format!("by_index({}): {}", i, e),
                });
                continue;
            }
        };

        if file_in_zip.is_dir() {
            continue;
        }

        let name_in_zip = file_in_zip.name().to_string();
        let filename = Path::new(&name_in_zip)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !filename.eq_ignore_ascii_case("modinfo.json") {
            continue;
        }
        saw_modinfo = true;

        let mut contents = String::new();
        if let Err(e) = file_in_zip.read_to_string(&mut contents) {
            errors.push(ModError {
                file: format!("{}::{}", zip_path.to_string_lossy(), name_in_zip),
                stage: "read_entry".into(),
                message: e.to_string(),
            });
            continue;
        }

        match json5_from_str::<Value>(&contents) {
            Ok(json) => {
                let modid = modinfo_modid(&json);
                let name = modinfo_string(&json, "name").unwrap_or_else(|| "Unknown Mod".into());
                let authors = {
                    let arr = modinfo_string_array(&json, "authors");
                    if arr.is_empty() {
                        vec!["Unknown".into()]
                    } else {
                        arr
                    }
                };
                let version = modinfo_string(&json, "version").unwrap_or_else(|| "0.0.0".into());
                return (
                    Some(OutputMod {
                        modid,
                        name,
                        authors,
                        version,
                        path: zip_path.to_string_lossy().into_owned(),
                    }),
                    true,
                );
            }
            Err(e) => {
                errors.push(ModError {
                    file: format!("{}::{}", zip_path.to_string_lossy(), name_in_zip),
                    stage: "parse_json".into(),
                    message: e.to_string(),
                });
            }
        }
    }

    (None, saw_modinfo)
}

/// Scan a single `Mods` directory for mod zips.
pub fn get_mods_in_dir(mods_path: &Path) -> Result<ModsResult, UiError> {
    if !mods_path.exists() || !mods_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mods_path.to_string_lossy().into_owned(),
        });
    }

    let mut mods: Vec<OutputMod> = Vec::new();
    let mut errors: Vec<ModError> = Vec::new();

    let read_dir = match read_dir(mods_path) {
        Ok(rd) => rd,
        Err(e) => {
            return Err(UiError {
                name: "io_error".into(),
                message: format!(
                    "Failed to read directory {}: {}",
                    mods_path.to_string_lossy(),
                    e
                ),
            });
        }
    };

    for entry_res in read_dir {
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                errors.push(ModError {
                    file: mods_path.to_string_lossy().into_owned(),
                    stage: "read_dir_entry".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let is_zip = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("zip"))
            .unwrap_or(false);
        if !is_zip {
            continue;
        }

        let file = match File::open(&path) {
            Ok(f) => f,
            Err(e) => {
                errors.push(ModError {
                    file: path.to_string_lossy().into_owned(),
                    stage: "open_zip_file".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let mut archive = match ZipArchive::new(file) {
            Ok(a) => a,
            Err(e) => {
                errors.push(ModError {
                    file: path.to_string_lossy().into_owned(),
                    stage: "parse_zip".into(),
                    message: e.to_string(),
                });
                continue;
            }
        };

        let (output, had_modinfo_entry) = read_modinfo_from_zip(&path, &mut archive, &mut errors);

        if let Some(output) = output {
            mods.push(output);
        } else if had_modinfo_entry {
            errors.push(ModError {
                file: path.to_string_lossy().into_owned(),
                stage: "zip_summary".into(),
                message: "Found modinfo.json but failed to read/parse any".into(),
            });
        } else {
            errors.push(ModError {
                file: path.to_string_lossy().into_owned(),
                stage: "missing_modinfo".into(),
                message: "No modinfo.json found in archive".into(),
            });
        }
    }

    Ok(ModsResult { mods, errors })
}

#[command]
pub async fn get_mods(app: AppHandle, path: String) -> Result<ModsResult, UiError> {
    log_info!("get_mods: {}", path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let mods_dir = PathBuf::from(path).join(paths::MODS_DIR);

    // Opens every zip in the directory: keep it off the UI thread.
    tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let result = get_mods_cached(&mods_dir);
        log_info!("get_mods completed in {}ms", start.elapsed().as_millis());
        result
    })
    .await
    .map_err(|e| {
        log_error!("get_mods: scan task failed: {e}");
        UiError::new("internal_error", format!("Mods scan failed: {e}"))
    })?
}

#[command]
pub fn get_mod_configs(app: AppHandle, profile_id: u64) -> Result<Vec<Value>, UiError> {
    log_info!("get_mod_configs: profile={}", profile_id);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let mod_config_path = pb.join(paths::MODCONFIG_DIR);
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }

    let mut configs = Vec::new();
    for entry in read_dir(mod_config_path)
        .map_err(|e| UiError::new("io_error", format!("Read dir error: {e}")))?
    {
        let entry = entry.map_err(|e| UiError::new("io_error", format!("Dir entry error: {e}")))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    let filename = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    let mut file = File::open(&path)
                        .map_err(|e| UiError::new("io_error", format!("Open file error: {e}")))?;
                    let mut content = String::new();
                    file.read_to_string(&mut content)
                        .map_err(|e| UiError::new("io_error", format!("Read file error: {e}")))?;
                    let json_content: Value = json5_from_str(&content).map_err(|e| {
                        UiError::new("parse_error", format!("Parse JSON error: {e}"))
                    })?;
                    configs.push(json!({
                        "filename": filename,
                        "content": json_content
                    }));
                }
            }
        }
    }

    Ok(configs)
}

#[command]
pub fn save_mod_config(
    app: AppHandle,
    profile_id: u64,
    file: String,
    new_code: String,
) -> Result<(), UiError> {
    log_info!("save_mod_config: profile={} file={}", profile_id, file);
    let (pb, _profile) = find_profile_by_id(&app, profile_id)?;
    let mod_config_path = pb.join(paths::MODCONFIG_DIR);
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }

    let file_path = safe_join(&mod_config_path, &file)?;
    if !file_path.exists() || !file_path.is_file() {
        return Err(UiError {
            name: "file_not_found".into(),
            message: file_path.to_string_lossy().into_owned(),
        });
    }

    // Refuse to write configs the game cannot parse.
    json5_from_str::<Value>(&new_code).map_err(|e| UiError {
        name: "invalid_json".into(),
        message: format!("Refusing to save invalid JSON5: {e}"),
    })?;

    let mut f = File::create(&file_path).map_err(|e| UiError {
        name: "create_file_failed".into(),
        message: format!("Failed to create file: {e}"),
    })?;
    f.write_all(new_code.as_bytes()).map_err(|e| UiError {
        name: "write_file_failed".into(),
        message: format!("Failed to write file: {e}"),
    })?;

    Ok(())
}

#[command]
pub async fn get_mod_updates(
    client: State<'_, Arc<reqwest::Client>>,
    params: String,
) -> Result<Value, UiError> {
    let url = format!("https://mods.vintagestory.at/api/updates?mods={}", params);
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Request error: {e}")))?;
    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }
    let res_text = res
        .text()
        .await
        .map_err(|e| UiError::new("io_error", format!("Read error: {e}")))?;
    let json: Value = from_str(&res_text)
        .map_err(|e| UiError::new("parse_error", format!("Parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn get_profile_mods(app: AppHandle, id: u64) -> Result<Vec<OutputMod>, UiError> {
    log_info!("get_profile_mods: profile={}", id);
    let (pb, _profile) = find_profile_by_id(&app, id)?;
    let mods_dir = pb.join(paths::MODS_DIR);

    tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let result = get_mods_cached(&mods_dir).map(|res| res.mods);
        log_info!(
            "get_profile_mods completed in {}ms",
            start.elapsed().as_millis()
        );
        result
    })
    .await
    .map_err(|e| {
        log_error!("get_profile_mods: scan task failed: {e}");
        UiError::new("internal_error", format!("Mods scan failed: {e}"))
    })?
}

#[command]
pub async fn remove_mod_from_profile(
    app: AppHandle,
    params: ModRemoveParams,
) -> Result<String, UiError> {
    log_info!("remove_mod_from_profile: {:?}", params.modpath);
    require_managed_path(&app, Path::new(&params.path), "Profile path")?;
    let mods_path = PathBuf::from(&params.path).join(paths::MODS_DIR);
    if !mods_path.exists() || !mods_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mods_path.to_string_lossy().into_owned(),
        });
    }
    let mod_file = PathBuf::from(&params.modpath);
    if !mod_file.exists() || !mod_file.is_file() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_file.to_string_lossy().into_owned(),
        });
    }
    if mod_file.parent().map(|p| p != mods_path).unwrap_or(true) {
        return Err(UiError {
            name: "invalid_path".into(),
            message: format!(
                "Mod path {} is not inside Mods directory {}",
                mod_file.to_string_lossy(),
                mods_path.to_string_lossy()
            ),
        });
    }
    remove_file(&mod_file).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove mod file: {e}"),
    })?;
    invalidate_mods_cache(&mods_path);
    Ok("removed".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modinfo_helpers_are_case_insensitive_and_tolerant() {
        let info = serde_json::json!({
            "ModID": 1234,
            "Name": "Test Mod",
            "Authors": ["A", "B"],
            "Version": 2
        });
        assert_eq!(modinfo_modid(&info), "1234");
        assert_eq!(modinfo_string(&info, "name").unwrap(), "Test Mod");
        assert_eq!(modinfo_string_array(&info, "authors").len(), 2);
        // Non-string version falls back to the default.
        assert_eq!(modinfo_string(&info, "version").unwrap_or_default(), "");

        let missing = serde_json::json!({});
        assert_eq!(modinfo_modid(&missing), "0");
        assert!(modinfo_string(&missing, "name").is_none());
        assert!(modinfo_string_array(&missing, "authors").is_empty());
    }

    #[test]
    fn mods_cache_uses_fingerprint_and_invalidates() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Mods");
        std::fs::create_dir(&dir).unwrap();

        assert!(try_cached_mods(&dir).is_none());

        let first = get_mods_cached(&dir).unwrap();
        assert!(first.mods.is_empty());
        assert!(try_cached_mods(&dir).is_some());

        // Adding a zip changes the fingerprint, so the cache misses again.
        std::fs::write(dir.join("mod.zip"), b"not a zip").unwrap();
        assert!(try_cached_mods(&dir).is_none());

        invalidate_mods_cache(&dir);
        assert!(try_cached_mods(&dir).is_none());
    }
}
