use reqwest::header::{HeaderMap, HeaderValue, HOST};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    str::FromStr,
};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;
use zip::read::ZipArchive;

use super::errors::UiError;

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
    tagid: i64,
    name: String,
    color: String,
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
pub async fn fetch_mod_tags() -> Result<Vec<ModTags>, UiError> {
    let res = reqwest::get("https://mods.vintagestory.at/api/tags")
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
pub async fn fetch_mods(options: FetchModsParams) -> Result<Vec<Mod>, UiError> {
    // Use the parameters for a GET request with search parameters
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(HOST, HeaderValue::from_static("mods.vintagestory.at"));

    let mut params = Vec::new();
    if !options.versions.is_empty() {
        for version in options.versions {
            params.push((format!("gameversions[]"), version.to_string()));
        }
    }
    if !options.search.is_empty() {
        params.push(("text".to_string(), options.search.clone()));
    }

    let res = client
        .get("https://mods.vintagestory.at/api/mods")
        .headers(headers)
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
pub async fn fetch_mod_info(modid: String) -> Result<Value, UiError> {
    let url = format!("https://mods.vintagestory.at/api/mod/{}", modid);
    let res = reqwest::get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: serde_json::Value =
        serde_json::from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn fetch_authors(search: String) -> Result<serde_json::Value, UiError> {
    let url = format!(
        "https://mods.vintagestory.at/api/v2/users/by-name/{}?contributors-only=true",
        search
    );
    let res = reqwest::get(&url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let json: serde_json::Value =
        serde_json::from_str(&res).map_err(|e| UiError::from(format!("JSON parse error: {e}")))?;
    Ok(json)
}

#[command]
pub async fn add_mod_to_installation(path: String, url: String) -> Result<String, UiError> {
    // Download the mod from the url and save it to the Mods directory inside the path
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        std::fs::create_dir_all(&pb).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    let response = reqwest::get(&url)
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
        .last()
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
pub fn get_mods(path: String) -> Result<ModsResult, UiError> {
    let mods_path = PathBuf::from(path).join("Mods");
    if !mods_path.exists() || !mods_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mods_path.to_string_lossy().into_owned(),
        });
    }

    let mut mods: Vec<OutputMod> = Vec::new();
    let mut errors: Vec<ModError> = Vec::new();

    let read_dir = match std::fs::read_dir(&mods_path) {
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

        // Open the zip file
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

        // Build archive
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

        // Search for modinfo.json (case-insensitive) anywhere in the archive
        let mut found_any = false;
        let mut found_valid = false;

        for i in 0..archive.len() {
            let mut file_in_zip = match archive.by_index(i) {
                Ok(f) => f,
                Err(e) => {
                    errors.push(ModError {
                        file: path.to_string_lossy().into_owned(),
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

            found_any = true;

            let mut contents = String::new();
            if let Err(e) = file_in_zip.read_to_string(&mut contents) {
                errors.push(ModError {
                    file: format!("{}::{}", path.to_string_lossy(), name_in_zip),
                    stage: "read_entry".into(),
                    message: e.to_string(),
                });
                // keep searching other entries
                continue;
            }

            match serde_json::from_str::<Value>(&contents) {
                Ok(json) => {
                    // Successfully parsed modinfo.json
                    let modid = json
                        .get("modid")
                        .and_then(|v| v.as_str())
                        .unwrap_or("0")
                        .to_string();
                    let path = path.to_string_lossy().into_owned();
                    let name = json
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown Mod")
                        .to_string();
                    let authors = json
                        .get("authors")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_else(|| vec!["Unknown".into()]);
                    let version = json
                        .get("version")
                        .and_then(|v| v.as_str())
                        .unwrap_or("0.0.0")
                        .to_string();
                    mods.push(OutputMod {
                        modid,
                        name,
                        authors,
                        version,
                        path,
                    });
                    found_valid = true;
                    // If you only want the first valid modinfo.json per zip, break here:
                    break;
                }
                Err(e) => {
                    errors.push(ModError {
                        file: format!("{}::{}", path.to_string_lossy(), name_in_zip),
                        stage: "parse_json".into(),
                        message: e.to_string(),
                    });
                    // keep searching for another modinfo.json in the same zip
                }
            }
        }

        // If zip had a modinfo.json but all were invalid/unreadable
        if found_any && !found_valid {
            // already recorded detailed errors per entry; optional summary:
            errors.push(ModError {
                file: path.to_string_lossy().into_owned(),
                stage: "zip_summary".into(),
                message: "Found modinfo.json but failed to read/parse any".into(),
            });
        }

        // If no modinfo.json at all, you can decide whether to add a notice:
        if !found_any {
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
pub fn get_mod_configs(app: AppHandle, installation_id: u64) -> Result<Vec<Value>, UiError> {
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(installation_id))
        });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            // Optionally, log the error or handle it as needed
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let mod_config_path = Path::new(installation["path"].as_str().unwrap()).join("ModConfig");
    if !mod_config_path.exists() || !mod_config_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: mod_config_path.to_string_lossy().into_owned(),
        });
    }
    // Traverse the ModConfig directory and read all .json files
    let mut configs = Vec::new();
    for entry in std::fs::read_dir(mod_config_path).map_err(|e| UiError::from(format!("Read dir error: {e}")))? {
        let entry = entry.map_err(|e| UiError::from(format!("Dir entry error: {e}")))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    // Output should be an array of objects with "filename" and "content"
                    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    let mut file = File::open(&path).map_err(|e| UiError::from(format!("Open file error: {e}")))?;
                    let mut content = String::new();
                    file.read_to_string(&mut content).map_err(|e| UiError::from(format!("Read file error: {e}")))?;
                    let json_content: Value = serde_json::from_str(&content).map_err(|e| UiError::from(format!("Parse JSON error: {e}")))?;
                    configs.push(serde_json::json!({
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
pub fn save_mod_config(app: AppHandle, installation_id: u64, file: String, new_code: String) -> Result<(), UiError> {
    // Find installation path from zustand
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(installation_id))
        });

    let installation = match installation {
        Some(inst) => inst,
        None => {
            return Err(UiError {
                name: "installation_not_found".into(),
                message: format!("Installation with id {} not found", installation_id),
            });
        }
    };

    let mod_config_path = Path::new(installation["path"].as_str().unwrap()).join("ModConfig");
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

    // Write new code to the file
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
pub async fn get_mod_updates(params: String) -> Result<Value, UiError> {
    let client = reqwest::Client::new();
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
        serde_json::from_str(&res_text).map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}

#[command]
pub fn get_installation_mods(app: AppHandle, id: i64) -> Result<Vec<OutputMod>, UiError> {
    let installations_zustand = app.zustand().get("installations", "installations").unwrap();
    let installations_json: Value = serde_json::from_value(installations_zustand).unwrap();
    let installation = installations_json
        .as_array()
        .and_then(|arr| arr.iter().find(|inst| inst["id"].as_i64() == Some(id)))
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", id),
        })?;
    let path = installation["path"].as_str().unwrap_or("");
    get_mods(path.to_string())
        .map(|res| res.mods)
        .map_err(|e| UiError {
            name: e.name,
            message: e.message,
        })
}

#[command]
pub async fn remove_mod_from_installation(params: ModRemoveParams) -> Result<String, UiError> {
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
    std::fs::remove_file(&mod_file).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove mod file: {e}"),
    })?;
    Ok("removed".into())
}
