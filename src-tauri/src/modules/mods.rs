use json5::from_str as json5_from_str;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, Value};
use std::{
    collections::HashMap,
    fs::{create_dir_all, read_dir, remove_file, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{command, AppHandle, State};
use zip::read::ZipArchive;

use super::errors::UiError;
use super::mod_store::{self, BlobMeta, ModStore};
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
    /// `modinfo.json` dependencies (modid -> version requirement), without the
    /// special `game` entry: the frontend checks them for missing mods.
    #[serde(default)]
    pub dependencies: HashMap<String, String>,
    /// True when the profile's `clientsettings.json` lists this mod in
    /// `stringListSettings.disabledMods` as `modid@version`.
    #[serde(default)]
    pub disabled: bool,
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

/// Writes bytes next to `destination` and renames them into place. Renaming
/// replaces an existing hardlink instead of truncating the shared inode.
fn write_bytes_atomic(destination: &Path, bytes: &[u8]) -> Result<(), UiError> {
    let parent = destination
        .parent()
        .ok_or_else(|| UiError::new("invalid_path", "Mod destination has no parent directory"))?;
    if !parent.is_dir() {
        return Err(UiError::not_found(format!(
            "Mod destination directory {} no longer exists",
            parent.display()
        )));
    }
    let temp = parent.join(format!(".storyforge-{}.tmp", uuid::Uuid::new_v4()));
    if let Err(error) = std::fs::write(&temp, bytes) {
        let _ = std::fs::remove_file(&temp);
        return Err(UiError::io(format!(
            "Failed to write {}: {error}",
            destination.display()
        )));
    }
    if let Err(error) = std::fs::rename(&temp, destination) {
        let _ = std::fs::remove_file(&temp);
        return Err(UiError::io(format!(
            "Failed to put {} in place: {error}",
            destination.display()
        )));
    }
    Ok(())
}

fn copy_file_atomic(source: &Path, destination: &Path) -> Result<(), UiError> {
    let parent = destination
        .parent()
        .ok_or_else(|| UiError::new("invalid_path", "Mod destination has no parent directory"))?;
    if !parent.is_dir() {
        return Err(UiError::not_found(format!(
            "Mod destination directory {} no longer exists",
            parent.display()
        )));
    }
    let temp = parent.join(format!(".storyforge-{}.tmp", uuid::Uuid::new_v4()));
    if let Err(error) = std::fs::copy(source, &temp) {
        let _ = std::fs::remove_file(&temp);
        return Err(UiError::io(format!(
            "Failed to copy {} to {}: {error}",
            source.display(),
            destination.display()
        )));
    }
    if let Err(error) = std::fs::rename(&temp, destination) {
        let _ = std::fs::remove_file(&temp);
        return Err(UiError::io(format!(
            "Failed to put {} in place: {error}",
            destination.display()
        )));
    }
    Ok(())
}

/// Download a mod by modid + version into a Mods directory.
/// Returns the saved filename.
pub async fn download_mod_file(
    client: &reqwest::Client,
    modid: &str,
    version: &str,
    mods_dir: &Path,
    store: Option<&ModStore>,
    expected_sha256: Option<&str>,
) -> Result<String, UiError> {
    log_info!(
        "download_mod_file: modid={} version={} dir={:?}",
        modid,
        version,
        mods_dir
    );

    if !mods_dir.exists() {
        create_dir_all(mods_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create Mods directory: {e}"),
        })?;
    }
    let store = store.filter(|store| store.is_usable_for(mods_dir));

    // A lock knows the exact bytes: prefer that blob even if another re-upload
    // of the same version is also in the store.
    if let (Some(store), Some(expected)) = (store, expected_sha256) {
        if let Some(blob) = store.blob_for_hash(expected) {
            let _guard = mod_store::lock_mod_mutations();
            let destination = mods_dir.join(&blob.filename);
            if store.link_to(&blob.hash, &destination).is_ok() {
                let meta = BlobMeta {
                    modid: Some(modid.to_string()),
                    version: Some(version.to_string()),
                };
                store.record_meta(&blob.hash, &meta);
                log_info!(
                    "download_mod_file: served {}@{} from the locked store blob",
                    modid,
                    version
                );
                invalidate_mods_cache(mods_dir);
                return Ok(blob.filename);
            }
        }
    }

    // A stored blob can answer this without the network. The profile still gets
    // its own normal-looking filename through a hardlink.
    if let Some(store) = store {
        if let Some(blob) = store.find_by_mod(modid, version) {
            let hash_matches = expected_sha256
                .map(|expected| blob.hash.eq_ignore_ascii_case(expected))
                .unwrap_or(true);
            if hash_matches {
                let _guard = mod_store::lock_mod_mutations();
                let destination = mods_dir.join(&blob.filename);
                if store.link_to(&blob.hash, &destination).is_ok() {
                    log_info!(
                        "download_mod_file: served {}@{} from the shared store",
                        modid,
                        version
                    );
                    invalidate_mods_cache(mods_dir);
                    return Ok(blob.filename);
                }
            }
        }
    }

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

    // 3. Download the mod file
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

    let content = response.bytes().await.map_err(|e| UiError {
        name: "read_response_failed".into(),
        message: format!("Failed to read response: {e}"),
    })?;

    if let Some(expected) = expected_sha256 {
        let actual = sha256_hex(&content);
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(UiError {
                name: "hash_mismatch".into(),
                message: format!(
                    "sha256 mismatch for {modid}@{version}: expected {expected}, got {actual}"
                ),
            });
        }
    }

    let destination = mods_dir.join(&filename);
    let _guard = mod_store::lock_mod_mutations();
    let mut saved_via_store = false;
    if let Some(store) = store {
        let meta = BlobMeta {
            modid: Some(modid.to_string()),
            version: Some(version.to_string()),
        };
        match store.ingest_bytes(&content, &filename, &meta) {
            Ok(ingested) => match store.link_to(&ingested.blob.hash, &destination) {
                Ok(_) => saved_via_store = true,
                Err(error) => log_error!(
                    "download_mod_file: store link failed, writing directly: {}",
                    error.message
                ),
            },
            Err(error) => log_error!(
                "download_mod_file: store ingest failed, writing directly: {}",
                error.message
            ),
        }
    }

    if !saved_via_store {
        write_bytes_atomic(&destination, &content)?;
    }

    log_info!("download_mod_file: saved to {:?}", destination);
    invalidate_mods_cache(mods_dir);
    Ok(filename)
}

/// Lowercase hex sha256 of a byte slice.
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}

/// Optional verification and shared-store inputs for a manifest download.
#[derive(Default)]
pub struct ManifestModOptions<'a> {
    pub expected_sha256: Option<&'a str>,
    pub expected_size: Option<u64>,
    pub store: Option<&'a ModStore>,
    pub meta: Option<&'a BlobMeta>,
}

/// Downloads a mod from an explicit manifest URL, verifying size and sha256
/// when the manifest provides them. Returns the stored filename.
pub async fn download_manifest_mod_file(
    client: &reqwest::Client,
    url: &str,
    filename: &str,
    mods_dir: &Path,
    options: ManifestModOptions<'_>,
) -> Result<String, UiError> {
    let ManifestModOptions {
        expected_sha256,
        expected_size,
        store,
        meta,
    } = options;
    if !mods_dir.exists() {
        create_dir_all(mods_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create Mods directory: {e}"),
        })?;
    }

    // The name comes from the manifest; reduce it to a single component so it
    // cannot escape the Mods directory.
    let filename = safe_file_name(filename)?;
    let store = store.filter(|store| store.is_usable_for(mods_dir));

    // A pack lock already carries the content hash: if the blob is present the
    // profile can be synced offline.
    if let (Some(store), Some(expected)) = (store, expected_sha256) {
        if let Some(blob) = store.blob_for_hash(expected) {
            let _guard = mod_store::lock_mod_mutations();
            let destination = mods_dir.join(&filename);
            if store.link_to(&blob.hash, &destination).is_ok() {
                if let Some(meta) = meta {
                    store.record_meta(&blob.hash, meta);
                }
                log_info!(
                    "download_manifest_mod_file: served {} from the shared store",
                    filename
                );
                invalidate_mods_cache(mods_dir);
                return Ok(filename);
            }
        }
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| UiError::new("request_error", format!("Download request error: {e}")))?;

    if !response.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("Download HTTP error: {}", response.status()),
        });
    }

    let content = response.bytes().await.map_err(|e| UiError {
        name: "read_response_failed".into(),
        message: format!("Failed to read response: {e}"),
    })?;

    if let Some(expected) = expected_size {
        if content.len() as u64 != expected {
            return Err(UiError {
                name: "size_mismatch".into(),
                message: format!(
                    "Size mismatch for {filename}: expected {expected} bytes, got {}",
                    content.len()
                ),
            });
        }
    }

    if let Some(expected) = expected_sha256 {
        let actual = sha256_hex(&content);
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(UiError {
                name: "hash_mismatch".into(),
                message: format!(
                    "sha256 mismatch for {filename}: expected {expected}, got {actual}"
                ),
            });
        }
    }

    let destination = mods_dir.join(&filename);

    let _guard = mod_store::lock_mod_mutations();
    let mut saved_via_store = false;
    if let Some(store) = store {
        let meta = meta.cloned().unwrap_or_default();
        match store.ingest_bytes(&content, &filename, &meta) {
            Ok(ingested) => match store.link_to(&ingested.blob.hash, &destination) {
                Ok(_) => saved_via_store = true,
                Err(error) => log_error!(
                    "download_manifest_mod_file: store link failed, writing directly: {}",
                    error.message
                ),
            },
            Err(error) => log_error!(
                "download_manifest_mod_file: store ingest failed, writing directly: {}",
                error.message
            ),
        }
    }

    if !saved_via_store {
        write_bytes_atomic(&destination, &content)?;
    }

    log_info!("download_manifest_mod_file: saved to {:?}", destination);
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
pub(crate) fn invalidate_mods_cache(prefix: &Path) {
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

/// Extracts the `dependencies` map (modid -> version requirement) from a
/// parsed `modinfo.json`.
fn dependencies_from_modinfo(value: &Value) -> HashMap<String, String> {
    modinfo_field(value, "dependencies")
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(modid, version)| {
                    let modid = modid.trim();
                    if modid.is_empty() {
                        return None;
                    }
                    let version = version.as_str().unwrap_or_default().trim().to_string();
                    Some((modid.to_string(), version))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The `dependencies` map of a mod zip's `modinfo.json` (modid -> version).
///
/// Dependency data is not part of the ModDB API, so it has to be read from the
/// archive. A missing or unreadable `modinfo.json` yields an empty map: the
/// install itself succeeded either way.
#[command]
pub fn get_mod_dependencies(
    app: AppHandle,
    path: String,
) -> Result<HashMap<String, String>, UiError> {
    require_managed_path(&app, Path::new(&path), "Mod path")?;
    let zip_path = PathBuf::from(&path);
    let file = File::open(&zip_path).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to open {}: {e}", zip_path.display()),
    })?;
    let mut archive = ZipArchive::new(file).map_err(|e| UiError {
        name: "archive_error".into(),
        message: format!("Failed to read {}: {e}", zip_path.display()),
    })?;

    for i in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(i) else {
            continue;
        };
        if entry.is_dir() {
            continue;
        }
        let name_in_zip = entry.name().to_string();
        let filename = Path::new(&name_in_zip)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !filename.eq_ignore_ascii_case("modinfo.json") {
            continue;
        }
        let mut contents = String::new();
        if entry.read_to_string(&mut contents).is_err() {
            continue;
        }
        let Ok(json) = json5_from_str::<Value>(&contents) else {
            continue;
        };
        return Ok(dependencies_from_modinfo(&json));
    }

    Ok(HashMap::new())
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
                        dependencies: dependencies_from_modinfo(&json),
                        disabled: false,
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

// ── Enabled / disabled mods ──

/// The `modid@version` entries of `stringListSettings.disabledMods`.
pub(crate) fn disabled_mods(settings: &Value) -> Vec<String> {
    settings
        .get("stringListSettings")
        .and_then(|list| list.get("disabledMods"))
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn disabled_entry_modid(entry: &str) -> &str {
    entry.split('@').next().unwrap_or(entry)
}

/// Whether the settings list this mod, at this version, as disabled.
///
/// An entry without a version (written by other tools) counts for every
/// version: the game matches `modid@version`, but for a toggle the modid match
/// is what the user means.
pub(crate) fn is_mod_disabled(settings: &Value, modid: &str, version: &str) -> bool {
    disabled_mods(settings).iter().any(|entry| {
        if !disabled_entry_modid(entry).eq_ignore_ascii_case(modid) {
            return false;
        }
        match entry.split_once('@') {
            Some((_, entry_version)) => entry_version == version,
            None => true,
        }
    })
}

/// Adds or removes `modid@version` in `disabledMods`, creating the section
/// when the file has none.
///
/// Removing drops every entry for the modid whatever version it names, so a
/// downgrade cannot resurrect a stale entry. Returns the updated list.
pub(crate) fn apply_mod_enabled(
    settings: &mut Value,
    modid: &str,
    version: &str,
    enabled: bool,
) -> Vec<String> {
    let Some(root) = settings.as_object_mut() else {
        return Vec::new();
    };
    let string_list = root
        .entry("stringListSettings")
        .or_insert_with(|| json!({}));
    let Some(list) = string_list.as_object_mut() else {
        return Vec::new();
    };
    let disabled = list.entry("disabledMods").or_insert_with(|| json!([]));
    let Some(array) = disabled.as_array_mut() else {
        return Vec::new();
    };
    array.retain(|entry| {
        entry
            .as_str()
            .map(|text| !disabled_entry_modid(text).eq_ignore_ascii_case(modid))
            .unwrap_or(true)
    });
    if !enabled {
        array.push(json!(format!("{modid}@{version}")));
    }
    disabled_mods(settings)
}

/// Reads a profile's `clientsettings.json` for a write.
///
/// A missing file is fine: the write creates it. Anything else is not. The
/// write paths replace the whole file with the keys they edited, so a file that
/// only fails to *parse* (the game rewrites it while it runs, so a torn read is
/// enough) must stop the write instead of being treated as empty — that would
/// drop keybinds, video settings and the stored account session.
fn read_settings_file(profile_dir: &Path) -> Result<Value, UiError> {
    let path = paths::clientsettings_path(profile_dir);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(json!({})),
        Err(error) => {
            return Err(UiError::io(format!(
                "Failed to read {}: {error}",
                path.display()
            )))
        }
    };
    let settings = json5_from_str::<Value>(&text).map_err(|error| {
        UiError::new(
            "settings_parse_error",
            format!(
                "Refusing to overwrite {}: failed to parse it: {error}",
                path.display()
            ),
        )
    })?;
    if !settings.is_object() {
        return Err(UiError::new(
            "settings_parse_error",
            format!(
                "Refusing to overwrite {}: it is not a settings object",
                path.display()
            ),
        ));
    }
    Ok(settings)
}

/// `clientsettings.json` for reading only (the mod scan's disabled flag): a
/// missing or unparseable file simply means no mod is disabled.
fn read_settings_file_or_default(profile_dir: &Path) -> Value {
    match read_settings_file(profile_dir) {
        Ok(settings) => settings,
        Err(error) => {
            log_error!("clientsettings.json unreadable, ignoring it: {error}");
            json!({})
        }
    }
}

fn write_settings_file(profile_dir: &Path, settings: &Value) -> Result<(), UiError> {
    let text = serde_json::to_string_pretty(settings)
        .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
    std::fs::write(paths::clientsettings_path(profile_dir), text)
        .map_err(|e| UiError::io(format!("Failed to write clientsettings.json: {e}")))
}

// ── Installing a mod from a file or URL ──

/// Identity of a mod zip, read from its own `modinfo.json`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFileInfo {
    pub modid: String,
    pub version: String,
    pub name: String,
    pub filename: String,
}

/// Reads a zip's identity, refusing anything without a readable `modinfo.json`.
pub(crate) fn inspect_mod_zip(zip_path: &Path) -> Result<ModFileInfo, UiError> {
    let file = File::open(zip_path)
        .map_err(|e| UiError::io(format!("Failed to open {}: {e}", zip_path.display())))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|_| UiError::new("invalid_mod", "The file is not a readable zip archive"))?;
    let mut errors = Vec::new();
    let (output, _) = read_modinfo_from_zip(zip_path, &mut archive, &mut errors);
    let Some(output) = output else {
        return Err(UiError::new(
            "invalid_mod",
            "The archive has no readable modinfo.json",
        ));
    };
    Ok(ModFileInfo {
        modid: output.modid,
        version: output.version,
        name: output.name,
        filename: zip_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_string(),
    })
}

/// Copies a local mod zip into a profile's `Mods` directory.
///
/// The zip must carry a `modinfo.json`. When the shared store is available the
/// bytes are linked instead of copied, so installing the same mod into several
/// profiles costs one copy on disk.
pub(crate) fn install_mod_file_at(
    profile_dir: &Path,
    source: &Path,
    store: Option<&ModStore>,
) -> Result<ModFileInfo, UiError> {
    if !source.is_file() {
        return Err(UiError::not_found(format!(
            "File not found: {}",
            source.display()
        )));
    }
    let mut info = inspect_mod_zip(source)?;
    let mods_dir = paths::mods_dir(profile_dir);
    create_dir_all(&mods_dir)
        .map_err(|e| UiError::io(format!("Failed to create Mods directory: {e}")))?;
    let filename = safe_file_name(
        source
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| UiError::new("invalid_filename", "The file has no usable name"))?,
    )?;
    let destination = mods_dir.join(&filename);
    let _guard = mod_store::lock_mod_mutations();

    if let Some(store) = store.filter(|store| store.is_usable_for(&mods_dir)) {
        let meta = BlobMeta {
            modid: Some(info.modid.clone()),
            version: Some(info.version.clone()),
        };
        match store.ingest_file(source, &filename, &meta) {
            Ok(ingested) => {
                if store.link_to(&ingested.blob.hash, &destination).is_ok() {
                    invalidate_mods_cache(&mods_dir);
                    info.filename = filename;
                    return Ok(info);
                }
            }
            Err(error) => log_error!(
                "install_mod_file_at: store ingest failed, copying directly: {}",
                error.message
            ),
        }
    }

    // Atomic replace: never truncate an existing hardlink if the store is off
    // but the profile still contains linked files from an earlier run.
    copy_file_atomic(source, &destination)?;
    invalidate_mods_cache(&mods_dir);
    info.filename = filename;
    Ok(info)
}

fn validate_mod_url(url: &str) -> Result<(), UiError> {
    let allowed = url.starts_with("https://")
        || url.starts_with("http://127.0.0.1:")
        || url.starts_with("http://localhost:");
    if allowed && !url.chars().any(char::is_whitespace) {
        Ok(())
    } else {
        Err(UiError::new(
            "invalid_url",
            "Enter an https:// link to a mod .zip",
        ))
    }
}

/// Downloads a mod zip from an explicit URL into a profile's `Mods` directory
/// and verifies it is a mod. A download that is not a mod is removed again.
pub(crate) async fn install_mod_url_at(
    client: &reqwest::Client,
    profile_dir: &Path,
    url: &str,
    store: Option<&ModStore>,
) -> Result<ModFileInfo, UiError> {
    let trimmed = url.split(['?', '#']).next().unwrap_or(url);
    let filename = trimmed
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("mod.zip");
    let filename = safe_file_name(filename)?;
    let mods_dir = paths::mods_dir(profile_dir);
    let stored = download_manifest_mod_file(
        client,
        url,
        &filename,
        &mods_dir,
        ManifestModOptions {
            store,
            ..Default::default()
        },
    )
    .await?;
    let path = mods_dir.join(&stored);
    match inspect_mod_zip(&path) {
        Ok(mut info) => {
            if let Some(store) = store {
                let meta = BlobMeta {
                    modid: Some(info.modid.clone()),
                    version: Some(info.version.clone()),
                };
                store.record_meta_for_file(&path, &meta);
            }
            info.filename = stored;
            Ok(info)
        }
        Err(error) => {
            let _ = remove_file(&path);
            invalidate_mods_cache(&mods_dir);
            Err(error)
        }
    }
}

// ── Copying mods between profiles ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCopyParams {
    /// Profile root to copy from.
    pub source: String,
    /// Profile root to copy into.
    pub destination: String,
    /// File names inside the source `Mods` directory. Empty copies every zip.
    pub files: Vec<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCopyResult {
    pub copied: usize,
    pub replaced: usize,
    pub unchanged: usize,
    pub failed: Vec<ModCopyFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCopyFailure {
    pub file: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CopyStatus {
    Copied,
    Replaced,
    Unchanged,
}

/// The zips directly inside a `Mods` directory, sorted for stable results.
fn zip_file_names(mods_dir: &Path) -> Result<Vec<String>, UiError> {
    let mut names = Vec::new();
    for entry in read_dir(mods_dir)
        .map_err(|e| UiError::io(format!("Failed to read {}: {e}", mods_dir.display())))?
    {
        let entry =
            entry.map_err(|e| UiError::io(format!("Failed to read a directory entry: {e}")))?;
        let path = entry.path();
        let is_zip = path.is_file()
            && path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("zip"))
                .unwrap_or(false);
        if !is_zip {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
            names.push(name.to_string());
        }
    }
    names.sort();
    Ok(names)
}

/// An unused file name in `mods_dir`, derived from `filename` (`a.zip`,
/// `a (2).zip`, …), so a copy never overwrites an unrelated mod that happens
/// to use the same file name.
fn available_destination_path(mods_dir: &Path, filename: &str) -> PathBuf {
    let original = mods_dir.join(filename);
    if !original.exists() {
        return original;
    }
    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("mod");
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("zip");
    let mut counter = 2;
    loop {
        let candidate = mods_dir.join(format!("{stem} ({counter}).{extension}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

/// Copies one source zip into the destination `Mods` directory.
///
/// A destination copy of the same mod and version is left alone. A different
/// version is replaced, including any duplicate files for the same modid, so
/// the destination never ends up loading two versions of one mod. A file name
/// already used by an unrelated mod gets a suffixed name instead.
fn copy_one_mod(
    source_mods: &Path,
    destination_mods: &Path,
    file: &str,
    existing_by_modid: &mut HashMap<String, Vec<OutputMod>>,
) -> Result<(CopyStatus, ModFileInfo), String> {
    let filename = safe_file_name(file).map_err(|error| error.message)?;
    if filename != file {
        return Err("Expected a file name inside the Mods folder, not a path".into());
    }
    let is_zip = Path::new(&filename)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("zip"))
        .unwrap_or(false);
    if !is_zip {
        return Err("Not a mod archive (.zip)".into());
    }

    let source = source_mods.join(&filename);
    if !source.is_file() {
        return Err(format!("File not found: {}", source.display()));
    }
    let info = inspect_mod_zip(&source).map_err(|error| error.message)?;
    let key = info.modid.to_ascii_lowercase();
    let existing = existing_by_modid.get(&key);
    let same_version = existing
        .map(|mods| {
            mods.iter()
                .any(|installed| installed.version.eq_ignore_ascii_case(&info.version))
        })
        .unwrap_or(false);
    if same_version {
        return Ok((CopyStatus::Unchanged, info));
    }

    let target = destination_mods.join(&filename);
    let target_is_this_mod = existing
        .map(|mods| {
            mods.iter()
                .any(|installed| Path::new(&installed.path) == target)
        })
        .unwrap_or(false);
    // Another mod can share the file name. Give this copy a distinct name
    // instead of deleting the unrelated mod.
    let target = if !target_is_this_mod && target.exists() {
        available_destination_path(destination_mods, &filename)
    } else {
        target
    };
    let existed = existing.map(|mods| !mods.is_empty()).unwrap_or(false) || target.exists();

    // Stage the copy first so a failed read or a full disk does not remove the
    // destination's current version.
    let temp = destination_mods.join(format!(".{filename}.{}.tmp", uuid::Uuid::new_v4()));
    std::fs::copy(&source, &temp).map_err(|error| {
        let _ = remove_file(&temp);
        format!("Failed to copy {}: {error}", source.display())
    })?;

    if let Some(replacements) = existing_by_modid.remove(&key) {
        for installed in replacements {
            let path = PathBuf::from(&installed.path);
            if let Err(error) = remove_file(&path) {
                let _ = remove_file(&temp);
                return Err(format!("Failed to replace {}: {error}", path.display()));
            }
        }
    }
    // A same-named file that could not be scanned is not in the map; remove it
    // so the rename lands on the exact file name.
    if target.exists() {
        if let Err(error) = remove_file(&target) {
            let _ = remove_file(&temp);
            return Err(format!("Failed to replace {}: {error}", target.display()));
        }
    }
    if let Err(error) = std::fs::rename(&temp, &target) {
        let _ = remove_file(&temp);
        return Err(format!("Failed to store {}: {error}", target.display()));
    }

    Ok((
        if existed {
            CopyStatus::Replaced
        } else {
            CopyStatus::Copied
        },
        info,
    ))
}

/// Copies mod zips between two profile roots, carrying the source's
/// enabled/disabled state for the mods that were actually copied or replaced.
fn copy_mods_between_profiles_at(
    source_dir: &Path,
    destination_dir: &Path,
    files: &[String],
) -> Result<ModCopyResult, UiError> {
    let source_canon = dunce::canonicalize(source_dir)
        .map_err(|e| UiError::not_found(format!("Source profile not found: {e}")))?;
    let destination_canon = dunce::canonicalize(destination_dir)
        .map_err(|e| UiError::not_found(format!("Destination profile not found: {e}")))?;
    if source_canon == destination_canon {
        return Err(UiError::new(
            "same_profile",
            "Choose a different profile to copy the mods to",
        ));
    }

    let source_mods = paths::mods_dir(source_dir);
    if !source_mods.is_dir() {
        return Err(UiError::not_found(format!(
            "No Mods folder in {}",
            source_dir.display()
        )));
    }
    let destination_mods = paths::mods_dir(destination_dir);
    create_dir_all(&destination_mods).map_err(|e| {
        UiError::io(format!(
            "Failed to create {}: {e}",
            destination_mods.display()
        ))
    })?;

    let requested = if files.is_empty() {
        zip_file_names(&source_mods)?
    } else {
        files.to_vec()
    };
    let existing_scan = get_mods_in_dir(&destination_mods)?;
    let mut existing_by_modid: HashMap<String, Vec<OutputMod>> = HashMap::new();
    for installed in existing_scan.mods {
        existing_by_modid
            .entry(installed.modid.to_ascii_lowercase())
            .or_default()
            .push(installed);
    }

    let source_settings = read_settings_file_or_default(source_dir);
    let mut copied_state: Vec<(String, String, bool)> = Vec::new();
    let mut result = ModCopyResult::default();

    for file in requested {
        match copy_one_mod(
            &source_mods,
            &destination_mods,
            &file,
            &mut existing_by_modid,
        ) {
            Ok((status, info)) => {
                match status {
                    CopyStatus::Copied => result.copied += 1,
                    CopyStatus::Replaced => result.replaced += 1,
                    CopyStatus::Unchanged => result.unchanged += 1,
                }
                if status != CopyStatus::Unchanged {
                    let disabled = is_mod_disabled(&source_settings, &info.modid, &info.version);
                    copied_state.push((info.modid, info.version, disabled));
                }
            }
            Err(message) => result.failed.push(ModCopyFailure { file, message }),
        }
    }

    if !copied_state.is_empty() {
        match read_settings_file(destination_dir) {
            Ok(mut settings) => {
                for (modid, version, disabled) in &copied_state {
                    apply_mod_enabled(&mut settings, modid, version, !*disabled);
                }
                if let Err(error) = write_settings_file(destination_dir, &settings) {
                    log_error!("copy_mods_to_profile: could not carry enabled state: {error}");
                }
            }
            Err(error) => {
                log_error!("copy_mods_to_profile: could not read destination settings: {error}")
            }
        }
    }

    invalidate_mods_cache(&destination_mods);
    Ok(result)
}

#[command]
pub async fn copy_mods_to_profile(
    app: AppHandle,
    params: ModCopyParams,
) -> Result<ModCopyResult, UiError> {
    log_info!(
        "copy_mods_to_profile: {} -> {} ({} file(s))",
        params.source,
        params.destination,
        params.files.len()
    );
    require_managed_path(&app, Path::new(&params.source), "Source profile")?;
    require_managed_path(&app, Path::new(&params.destination), "Destination profile")?;
    tokio::task::spawn_blocking(move || {
        copy_mods_between_profiles_at(
            Path::new(&params.source),
            Path::new(&params.destination),
            &params.files,
        )
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Copy failed: {e}")))?
}

/// Whether a preset's disabled-modid list names one mod (case-insensitive).
pub(crate) fn is_in_disabled_set(disabled: &[String], modid: &str) -> bool {
    disabled
        .iter()
        .any(|entry| entry.eq_ignore_ascii_case(modid))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModStateParams {
    pub path: String,
    /// Every modid that should be disabled; installed mods not named are
    /// enabled.
    pub disabled: Vec<String>,
}

/// Applies a whole enabled/disabled configuration to a profile in one write:
/// every installed mod named in `disabled` is turned off, every other
/// installed mod is turned on. Used by mod presets.
#[command]
pub async fn apply_mod_state(
    app: AppHandle,
    params: ModStateParams,
) -> Result<Vec<String>, UiError> {
    log_info!(
        "apply_mod_state: {} disabled mod(s) path={}",
        params.disabled.len(),
        params.path
    );
    require_managed_path(&app, Path::new(&params.path), "Profile path")?;
    tokio::task::spawn_blocking(move || {
        let profile_dir = PathBuf::from(&params.path);
        let mods_dir = paths::mods_dir(&profile_dir);
        let mods = if mods_dir.is_dir() {
            get_mods_in_dir(&mods_dir)
                .map(|result| result.mods)
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        let mut settings = read_settings_file(&profile_dir)?;
        for installed in &mods {
            let enabled = !is_in_disabled_set(&params.disabled, &installed.modid);
            apply_mod_enabled(&mut settings, &installed.modid, &installed.version, enabled);
        }
        write_settings_file(&profile_dir, &settings)?;
        Ok(disabled_mods(&settings))
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Apply mod state failed: {e}")))?
}

/// Installs a local mod zip into a profile.
#[command]
pub async fn install_mod_file(
    app: AppHandle,
    path: String,
    file: String,
) -> Result<ModFileInfo, UiError> {
    log_info!("install_mod_file: {} -> {}", file, path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let store = mod_store::for_app_best_effort(&app);
    tokio::task::spawn_blocking(move || {
        install_mod_file_at(Path::new(&path), Path::new(&file), store.as_ref())
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Install failed: {e}")))?
}

/// Installs a mod zip from a direct URL into a profile.
#[command]
pub async fn install_mod_url(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    path: String,
    url: String,
) -> Result<ModFileInfo, UiError> {
    log_info!("install_mod_url: {} -> {}", url, path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    validate_mod_url(&url)?;
    let store = mod_store::for_app_best_effort(&app);
    install_mod_url_at(&client, Path::new(&path), &url, store.as_ref()).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEnabledParams {
    pub path: String,
    pub modid: String,
    pub version: String,
    pub enabled: bool,
}

/// Enables or disables one installed mod for a profile by editing the profile's
/// `clientsettings.json` (`stringListSettings.disabledMods`). Returns the
/// updated list of disabled `modid@version` entries.
#[command]
pub async fn set_mod_enabled(
    app: AppHandle,
    params: ModEnabledParams,
) -> Result<Vec<String>, UiError> {
    log_info!(
        "set_mod_enabled: {}@{} enabled={} path={}",
        params.modid,
        params.version,
        params.enabled,
        params.path
    );
    require_managed_path(&app, Path::new(&params.path), "Profile path")?;
    tokio::task::spawn_blocking(move || {
        let profile_dir = PathBuf::from(&params.path);
        let mut settings = read_settings_file(&profile_dir)?;
        let updated = apply_mod_enabled(
            &mut settings,
            &params.modid,
            &params.version,
            params.enabled,
        );
        write_settings_file(&profile_dir, &settings)?;
        Ok(updated)
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("Set mod state failed: {e}")))?
}

#[command]
pub async fn get_mods(app: AppHandle, path: String) -> Result<ModsResult, UiError> {
    log_info!("get_mods: {}", path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let profile_dir = PathBuf::from(&path);
    let mods_dir = profile_dir.join(paths::MODS_DIR);

    // Opens every zip in the directory: keep it off the UI thread. The
    // disabled flag is read after the (cached) scan so it stays correct
    // without re-opening any zip when only clientsettings.json changed.
    tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let mut result = get_mods_cached(&mods_dir);
        if let Ok(scanned) = result.as_mut() {
            let settings = read_settings_file_or_default(&profile_dir);
            for item in &mut scanned.mods {
                item.disabled = is_mod_disabled(&settings, &item.modid, &item.version);
            }
        }
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
    let _guard = mod_store::lock_mod_mutations();
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

    #[test]
    fn hashes_bytes_with_sha256() {
        // Known vector: sha256("abc").
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn reads_dependencies_from_modinfo() {
        let info = serde_json::json!({
            "modID": "aculinaryartillery",
            "dependencies": {
                "game": "1.22.3",
                "expandedfoods": "2.0.0",
                "someother": ""
            }
        });
        let deps = dependencies_from_modinfo(&info);
        assert_eq!(deps.get("game").map(String::as_str), Some("1.22.3"));
        assert_eq!(deps.get("expandedfoods").map(String::as_str), Some("2.0.0"));
        assert_eq!(deps.get("someother").map(String::as_str), Some(""));

        // Missing or non-object dependencies yield an empty map.
        assert!(dependencies_from_modinfo(&serde_json::json!({})).is_empty());
        assert!(
            dependencies_from_modinfo(&serde_json::json!({ "dependencies": "nope" })).is_empty()
        );
    }

    fn write_test_mod_zip(path: &Path, modid: &str, version: &str, name: &str) {
        let file = File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("modinfo.json", zip::write::SimpleFileOptions::default())
            .unwrap();
        let info = serde_json::json!({
            "modid": modid,
            "name": name,
            "version": version,
            "type": "code",
            "side": "universal",
        });
        writer.write_all(info.to_string().as_bytes()).unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn installs_a_local_mod_zip() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        let source = tmp.path().join("carryon_1.13.0.zip");
        write_test_mod_zip(&source, "carryon", "1.13.0", "Carry On");

        let info = install_mod_file_at(&profile, &source, None).unwrap();
        assert_eq!(info.modid, "carryon");
        assert_eq!(info.version, "1.13.0");
        assert_eq!(info.name, "Carry On");
        assert_eq!(info.filename, "carryon_1.13.0.zip");
        assert!(paths::mods_dir(&profile)
            .join("carryon_1.13.0.zip")
            .is_file());

        // The installed copy scans cleanly.
        let scanned = get_mods_in_dir(&paths::mods_dir(&profile)).unwrap();
        assert_eq!(scanned.mods.len(), 1);
        assert_eq!(scanned.mods[0].modid, "carryon");
    }

    #[test]
    fn installing_into_two_profiles_shares_one_store_blob() {
        let tmp = tempfile::tempdir().unwrap();
        let store = ModStore::new(tmp.path().join("store"));
        let profile_a = tmp.path().join("profile-a");
        let profile_b = tmp.path().join("profile-b");
        std::fs::create_dir_all(&profile_a).unwrap();
        std::fs::create_dir_all(&profile_b).unwrap();
        let source = tmp.path().join("carryon_1.13.0.zip");
        write_test_mod_zip(&source, "carryon", "1.13.0", "Carry On");

        let first = install_mod_file_at(&profile_a, &source, Some(&store)).unwrap();
        let second = install_mod_file_at(&profile_b, &source, Some(&store)).unwrap();
        assert_eq!(first.filename, "carryon_1.13.0.zip");
        assert_eq!(second.filename, "carryon_1.13.0.zip");

        let blob = store.find_by_mod("carryon", "1.13.0").unwrap();
        let linked_a = paths::mods_dir(&profile_a).join(&first.filename);
        let linked_b = paths::mods_dir(&profile_b).join(&second.filename);
        assert!(same_file::is_same_file(Path::new(&blob.path), &linked_a).unwrap());
        assert!(same_file::is_same_file(Path::new(&blob.path), &linked_b).unwrap());
        assert_eq!(store.stats().unwrap().blob_count, 1);
    }

    #[test]
    fn install_accepts_a_zip_already_in_the_mods_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        let mods_dir = paths::mods_dir(&profile);
        std::fs::create_dir_all(&mods_dir).unwrap();
        let existing = mods_dir.join("mod_a.zip");
        write_test_mod_zip(&existing, "a", "1.0.0", "A");

        let info = install_mod_file_at(&profile, &existing, None).unwrap();
        assert_eq!(info.modid, "a");
        assert!(existing.is_file());
        let scanned = get_mods_in_dir(&mods_dir).unwrap();
        assert_eq!(scanned.mods.len(), 1);
    }

    #[test]
    fn install_rejects_files_without_modinfo() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        std::fs::create_dir_all(&profile).unwrap();
        let bad = tmp.path().join("bad.zip");
        let file = File::create(&bad).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("readme.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"nope").unwrap();
        writer.finish().unwrap();

        let error = install_mod_file_at(&profile, &bad, None).unwrap_err();
        assert_eq!(error.name, "invalid_mod");
        assert!(!paths::mods_dir(&profile).join("bad.zip").exists());
    }

    #[test]
    fn copies_selected_mods_to_another_profile() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination).unwrap();
        write_test_mod_zip(&source_mods.join("a.zip"), "a", "1.0.0", "A");
        write_test_mod_zip(&source_mods.join("b.zip"), "b", "1.0.0", "B");

        let result =
            copy_mods_between_profiles_at(&source, &destination, &["a.zip".to_string()]).unwrap();
        assert_eq!(result.copied, 1);
        assert_eq!(result.replaced, 0);
        assert_eq!(result.unchanged, 0);
        assert!(result.failed.is_empty());

        let scanned = get_mods_in_dir(&paths::mods_dir(&destination)).unwrap();
        assert_eq!(scanned.mods.len(), 1);
        assert_eq!(scanned.mods[0].modid, "a");
        assert!(!paths::mods_dir(&destination).join("b.zip").exists());
    }

    #[test]
    fn copies_all_mods_when_no_file_list_is_given() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination).unwrap();
        write_test_mod_zip(&source_mods.join("a.zip"), "a", "1.0.0", "A");
        write_test_mod_zip(&source_mods.join("b.zip"), "b", "1.0.0", "B");
        std::fs::write(source_mods.join("notes.txt"), b"ignored").unwrap();

        let result = copy_mods_between_profiles_at(&source, &destination, &[]).unwrap();
        assert_eq!(result.copied, 2);
        let scanned = get_mods_in_dir(&paths::mods_dir(&destination)).unwrap();
        assert_eq!(scanned.mods.len(), 2);
    }

    #[test]
    fn copying_a_different_version_replaces_the_installed_one() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        let destination_mods = paths::mods_dir(&destination);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination_mods).unwrap();
        write_test_mod_zip(&source_mods.join("a_2.zip"), "a", "2.0.0", "A");
        write_test_mod_zip(&destination_mods.join("a_1.zip"), "a", "1.0.0", "A");
        std::fs::write(
            paths::clientsettings_path(&destination),
            r#"{"stringListSettings":{"disabledMods":["a@1.0.0"]}}"#,
        )
        .unwrap();

        let result =
            copy_mods_between_profiles_at(&source, &destination, &["a_2.zip".to_string()]).unwrap();
        assert_eq!(result.replaced, 1);
        assert!(result.failed.is_empty());

        let scanned = get_mods_in_dir(&destination_mods).unwrap();
        assert_eq!(scanned.mods.len(), 1);
        assert_eq!(scanned.mods[0].version, "2.0.0");
        assert!(!destination_mods.join("a_1.zip").exists());
        // The old version's disabled entry must not linger.
        let settings = read_settings_file(&destination).unwrap();
        assert!(!is_mod_disabled(&settings, "a", "2.0.0"));
    }

    #[test]
    fn copying_the_same_version_is_a_no_op() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        let destination_mods = paths::mods_dir(&destination);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination_mods).unwrap();
        write_test_mod_zip(&source_mods.join("a.zip"), "a", "2.0.0", "A");
        write_test_mod_zip(&destination_mods.join("a_other.zip"), "a", "2.0.0", "A");

        let result =
            copy_mods_between_profiles_at(&source, &destination, &["a.zip".to_string()]).unwrap();
        assert_eq!(result.unchanged, 1);
        assert_eq!(result.copied, 0);
        assert!(!destination_mods.join("a.zip").exists());
        assert!(destination_mods.join("a_other.zip").exists());
    }

    #[test]
    fn copying_mods_carries_the_disabled_state() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination).unwrap();
        write_test_mod_zip(&source_mods.join("a.zip"), "a", "2.0.0", "A");
        std::fs::write(
            paths::clientsettings_path(&source),
            r#"{"stringListSettings":{"disabledMods":["a@2.0.0"]}}"#,
        )
        .unwrap();

        copy_mods_between_profiles_at(&source, &destination, &["a.zip".to_string()]).unwrap();
        let settings = read_settings_file(&destination).unwrap();
        assert!(is_mod_disabled(&settings, "a", "2.0.0"));
    }

    #[test]
    fn a_filename_collision_does_not_replace_another_mod() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        let destination = tmp.path().join("destination");
        let source_mods = paths::mods_dir(&source);
        let destination_mods = paths::mods_dir(&destination);
        std::fs::create_dir_all(&source_mods).unwrap();
        std::fs::create_dir_all(&destination_mods).unwrap();
        write_test_mod_zip(&source_mods.join("shared.zip"), "a", "1.0.0", "A");
        write_test_mod_zip(&destination_mods.join("shared.zip"), "b", "1.0.0", "B");

        let result =
            copy_mods_between_profiles_at(&source, &destination, &["shared.zip".to_string()])
                .unwrap();
        assert_eq!(result.copied, 1);
        let mut scanned = get_mods_in_dir(&destination_mods).unwrap();
        scanned.mods.sort_by(|a, b| a.modid.cmp(&b.modid));
        assert_eq!(
            scanned
                .mods
                .iter()
                .map(|installed| installed.modid.as_str())
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
        assert!(destination_mods.join("shared (2).zip").is_file());
        // The unrelated mod keeps its original file.
        assert_eq!(
            inspect_mod_zip(&destination_mods.join("shared.zip"))
                .unwrap()
                .modid,
            "b"
        );
    }

    #[test]
    fn copy_refuses_the_same_profile_and_path_tricks() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        let other = tmp.path().join("other");
        let mods = paths::mods_dir(&profile);
        std::fs::create_dir_all(&mods).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        write_test_mod_zip(&mods.join("a.zip"), "a", "1.0.0", "A");

        let error = copy_mods_between_profiles_at(&profile, &profile, &[]).unwrap_err();
        assert_eq!(error.name, "same_profile");

        let result =
            copy_mods_between_profiles_at(&profile, &other, &["../a.zip".to_string()]).unwrap();
        assert_eq!(result.failed.len(), 1);
        assert!(!paths::mods_dir(&other).join("a.zip").exists());
    }

    #[test]
    fn disabled_set_matching_is_case_insensitive() {
        let disabled = vec!["carryon".to_string(), "ExtraOverlays".to_string()];
        assert!(is_in_disabled_set(&disabled, "CarryOn"));
        assert!(is_in_disabled_set(&disabled, "extraoverlays"));
        assert!(!is_in_disabled_set(&disabled, "stonequarry"));
        assert!(!is_in_disabled_set(&[], "carryon"));
    }

    #[test]
    fn mod_url_validation_requires_https() {
        assert!(validate_mod_url("https://mods.vintagestory.at/download/1/mod.zip").is_ok());
        assert!(validate_mod_url("http://127.0.0.1:8080/mod.zip").is_ok());
        assert!(validate_mod_url("http://localhost:8080/mod.zip").is_ok());
        assert!(validate_mod_url("http://example.com/mod.zip").is_err());
        assert!(validate_mod_url("ftp://example.com/mod.zip").is_err());
        assert!(validate_mod_url("https://example.com/a b.zip").is_err());
    }

    #[test]
    fn apply_mod_enabled_adds_and_removes_entries() {
        let mut settings = serde_json::json!({
            "stringListSettings": {"disabledMods": ["carryon@1.13.0"], "modPaths": ["x"]},
            "intSettings": {"fov": 70}
        });

        let updated = apply_mod_enabled(&mut settings, "extraoverlays", "1.6.0", false);
        assert_eq!(updated, vec!["carryon@1.13.0", "extraoverlays@1.6.0"]);

        // Enabling drops every entry for the modid, whatever version it names.
        let updated = apply_mod_enabled(&mut settings, "carryon", "2.0.0", true);
        assert_eq!(updated, vec!["extraoverlays@1.6.0"]);

        // Unrelated settings and other string lists survive.
        assert_eq!(settings["intSettings"]["fov"], 70);
        assert_eq!(settings["stringListSettings"]["modPaths"][0], "x");
    }

    #[test]
    fn apply_mod_enabled_creates_missing_sections() {
        let mut settings = serde_json::json!({});
        let updated = apply_mod_enabled(&mut settings, "a", "1.0.0", false);
        assert_eq!(updated, vec!["a@1.0.0"]);
        assert!(is_mod_disabled(&settings, "a", "1.0.0"));
        assert!(!is_mod_disabled(&settings, "a", "1.0.1"));
        // Case-insensitive, like the game's own matching.
        assert!(is_mod_disabled(&settings, "A", "1.0.0"));
    }

    #[test]
    fn apply_mod_enabled_is_idempotent() {
        let mut settings = serde_json::json!({});
        apply_mod_enabled(&mut settings, "a", "1.0.0", false);
        let updated = apply_mod_enabled(&mut settings, "a", "1.0.0", false);
        assert_eq!(updated, vec!["a@1.0.0"]);
    }

    #[test]
    fn disabled_mods_tolerate_foreign_entries() {
        // A non-string entry is preserved in the raw list and ignored by the
        // reader; an entry without a version disables every version.
        let mut settings = serde_json::json!({
            "stringListSettings": {"disabledMods": [7, "legacy"]}
        });
        assert!(is_mod_disabled(&settings, "legacy", "9.9.9"));
        let updated = apply_mod_enabled(&mut settings, "other", "1.0.0", false);
        assert_eq!(updated, vec!["legacy", "other@1.0.0"]);
        assert_eq!(settings["stringListSettings"]["disabledMods"][0], 7);
    }

    #[test]
    fn settings_write_refuses_an_unparseable_file() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        std::fs::create_dir_all(&profile).unwrap();

        // A missing file is a fresh start, not an error.
        assert_eq!(read_settings_file(&profile).unwrap(), json!({}));

        // A file that only fails to parse stops the write instead of being
        // replaced with an empty document.
        let path = paths::clientsettings_path(&profile);
        std::fs::write(&path, "{\"keybinds\": ").unwrap();
        let error = read_settings_file(&profile).unwrap_err();
        assert_eq!(error.name, "settings_parse_error");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"keybinds\": ");

        // Non-object documents are refused too.
        std::fs::write(&path, "[1, 2]").unwrap();
        assert_eq!(
            read_settings_file(&profile).unwrap_err().name,
            "settings_parse_error"
        );

        // The read-only path tolerates what the write paths refuse.
        assert_eq!(read_settings_file_or_default(&profile), json!({}));

        // A parseable document round-trips through the tolerant path unchanged.
        std::fs::write(&path, "{\"intSettings\": {\"fov\": 70}}").unwrap();
        let settings = read_settings_file_or_default(&profile);
        assert_eq!(settings["intSettings"]["fov"], 70);
    }
}
