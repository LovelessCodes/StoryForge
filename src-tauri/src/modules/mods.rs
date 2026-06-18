use json5::from_str as json5_from_str;
use serde::{Deserialize, Serialize};
use serde_json::{from_str, json, Value};
use std::{
    fs::{create_dir_all, read_dir, remove_file, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
    sync::Arc,
};
use tauri::{command, AppHandle, State};
use zip::read::ZipArchive;

use super::errors::UiError;
use super::installations::find_installation_by_id;
use crate::log_info;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortBy {
    Created,
    LastReleased,
    Downloads,
    Follows,
    Comments,
    TrendingPoints,
}

impl FromStr for ModSortBy {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "asset.created" => Ok(ModSortBy::Created),
            "lastreleased" => Ok(ModSortBy::LastReleased),
            "downloads" => Ok(ModSortBy::Downloads),
            "follows" => Ok(ModSortBy::Follows),
            "comments" => Ok(ModSortBy::Comments),
            "trendingpoints" => Ok(ModSortBy::TrendingPoints),
            _ => Err("unknown sort key"),
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortOrder {
    Desc,
    Asc,
}

impl FromStr for ModSortOrder {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "desc" => Ok(ModSortOrder::Desc),
            "asc" => Ok(ModSortOrder::Asc),
            _ => Err("unknown sort order"),
        }
    }
}

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
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: Value =
        from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
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
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: Value =
        from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn add_mod_to_installation(
    client: State<'_, Arc<reqwest::Client>>,
    path: String,
    url: String,
) -> Result<String, UiError> {
    log_info!("add_mod_to_installation: {:?}", path);
    let pb = PathBuf::from(path).join("Mods");
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
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;
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
    let filepath = pb.join(filename);
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
    Ok("added".into())
}

#[command]
pub async fn download_mod(
    client: State<'_, Arc<reqwest::Client>>,
    modid: String,
    version: String,
    installation_path: String,
) -> Result<String, UiError> {
    let mods_dir = PathBuf::from(&installation_path).join("Mods");
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
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let mod_info: ModInfoResponse = res
        .json()
        .await
        .map_err(|e| UiError::from(format!("JSON error: {e}")))?;

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
        .map_err(|e| UiError::from(format!("Download request error: {e}")))?;

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
    Ok(filename)
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
) -> Option<OutputMod> {
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
                return Some(OutputMod {
                    modid,
                    name,
                    authors,
                    version,
                    path: zip_path.to_string_lossy().into_owned(),
                });
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

    None
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

        let had_modinfo_entry = archive.file_names().any(|name| {
            Path::new(name).file_name().map_or(false, |f| {
                f.to_str()
                    .map_or(false, |s| s.eq_ignore_ascii_case("modinfo.json"))
            })
        });

        if let Some(output) = read_modinfo_from_zip(&path, &mut archive, &mut errors) {
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
pub fn get_mods(path: String) -> Result<ModsResult, UiError> {
    log_info!("get_mods: {}", path);
    let start = std::time::Instant::now();
    let result = get_mods_in_dir(&PathBuf::from(path).join("Mods"));
    log_info!("get_mods completed in {}ms", start.elapsed().as_millis());
    result
}

#[command]
pub fn get_mod_configs(app: AppHandle, installation_id: u64) -> Result<Vec<Value>, UiError> {
    log_info!("get_mod_configs: installation={}", installation_id);
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let mod_config_path = pb.join("ModConfig");
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }

    let mut configs = Vec::new();
    for entry in
        read_dir(mod_config_path).map_err(|e| UiError::from(format!("Read dir error: {e}")))?
    {
        let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
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
                        .map_err(|e| UiError::from(format!("Open file error: {e}")))?;
                    let mut content = String::new();
                    file.read_to_string(&mut content)
                        .map_err(|e| UiError::from(format!("Read file error: {e}")))?;
                    let json_content: Value = json5_from_str(&content)
                        .map_err(|e| UiError::from(format!("Parse JSON error: {e}")))?;
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
    installation_id: u64,
    file: String,
    new_code: String,
) -> Result<(), UiError> {
    log_info!(
        "save_mod_config: installation={} file={}",
        installation_id,
        file
    );
    let (pb, _installation) = find_installation_by_id(&app, installation_id)?;
    let mod_config_path = pb.join("ModConfig");
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }

    let file_path = mod_config_path.join(&file);
    if !file_path.exists() || !file_path.is_file() {
        return Err(UiError {
            name: "file_not_found".into(),
            message: file_path.to_string_lossy().into_owned(),
        });
    }

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
        .map_err(|e| UiError::from(format!("Request error: {e}")))?;
    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }
    let res_text = res
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;
    let json: Value =
        from_str(&res_text).map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}

#[command]
pub fn get_installation_mods(app: AppHandle, id: u64) -> Result<Vec<OutputMod>, UiError> {
    log_info!("get_installation_mods: installation={}", id);
    let start = std::time::Instant::now();
    let (pb, _installation) = find_installation_by_id(&app, id)?;
    let result = get_mods_in_dir(&pb.join("Mods"))
        .map(|res| res.mods)
        .map_err(|e| UiError {
            name: e.name,
            message: e.message,
        });
    log_info!(
        "get_installation_mods completed in {}ms",
        start.elapsed().as_millis()
    );
    result
}

#[command]
pub async fn remove_mod_from_installation(params: ModRemoveParams) -> Result<String, UiError> {
    log_info!("remove_mod_from_installation: {:?}", params.modpath);
    let mods_path = PathBuf::from(&params.path).join("Mods");
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
    Ok("removed".into())
}
