use futures_util::StreamExt;
use quick_xml::de::from_str;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, HOST, CONTENT_DISPOSITION};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{self, Read, Seek, Write},
    path::{Path, PathBuf},
    process::Command,
    str::FromStr,
};
use tauri::{command, AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_zustand::{ManagerExt};
use zip::read::ZipArchive;

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthVerifyResponse {
    pub valid: u8,
    pub entitlements: Option<String>,
    pub mptoken: Option<String>,
    pub hasgameserver: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UiError {
    pub name: String,
    pub message: String,
}

impl From<String> for UiError {
    fn from(s: String) -> Self {
        UiError {
            name: "UNKNOWN".into(),
            message: s,
        }
    }
}

impl From<&str> for UiError {
    fn from(s: &str) -> Self {
        UiError {
            name: "UNKNOWN".into(),
            message: s.to_string(),
        }
    }
}
#[derive(Debug, Serialize, Deserialize)]
pub struct NewsItem {
    pub title: String,
    pub link: String,
    pub description: String,
    pub guid: String,
    pub pubDate: String,
}

#[derive(Debug, Deserialize)]
struct Channel {
    item: Vec<NewsItem>,
}

#[derive(Debug, Deserialize)]
struct Rss {
    channel: Channel,
}

#[command]
async fn fetch_news() -> Result<serde_json::Value, UiError> {
    let url = "https://www.vintagestory.at/forums/forum/7-news.xml/";
    let xml = reqwest::get(url)
        .await
        .map_err(|e| UiError::from(format!("Request error: {e}")))?
        .text()
        .await
        .map_err(|e| UiError::from(format!("Read error: {e}")))?;

    let rss: Rss = from_str(&xml).map_err(|e| UiError::from(format!("XML parse error: {e}")))?;
    Ok(json!(rss.channel.item))
}

#[derive(Debug, Serialize, Deserialize)]
struct ModTags {
    tagid: i64,
    name: String,
    color: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModTagsResponse {
    statuscode: String,
    tags: Vec<ModTags>,
}

#[command]
async fn fetch_mod_tags() -> Result<Vec<ModTags>, UiError> {
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
async fn fetch_versions() -> Result<Vec<String>, UiError> {
    let res = reqwest::get("https://vsapi.betterjs.dev/versions")
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json = res
        .json::<Vec<String>>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;

    Ok(json)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortBy {
    Created,
    LastReleased,
    Downloads,
    Follows,
    Comments,
    TrendingPoints,
}

impl ModSortBy {
    pub fn as_str(self) -> &'static str {
        match self {
            ModSortBy::Created => "asset.created",
            ModSortBy::LastReleased => "lastreleased",
            ModSortBy::Downloads => "downloads",
            ModSortBy::Follows => "follows",
            ModSortBy::Comments => "comments",
            ModSortBy::TrendingPoints => "trendingpoints",
        }
    }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSortOrder {
    Desc,
    Asc,
}

impl ModSortOrder {
    pub fn as_str(self) -> &'static str {
        match self {
            ModSortOrder::Desc => "desc",
            ModSortOrder::Asc => "asc",
        }
    }
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

#[command]
async fn get_download_links() -> Result<Value, UiError> {
    let res = reqwest::get("https://vsapi.betterjs.dev/download")
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
async fn fetch_mods(options: FetchModsParams) -> Result<Vec<Mod>, UiError> {
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
async fn fetch_authors(search: String) -> Result<serde_json::Value, UiError> {
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
async fn get_download_link(version: &str) -> Result<String, UiError> {
    // if platform is macos it should say mac
    let platform = tauri_plugin_os::platform().replace("macos", "mac");
    let url = format!(
        "https://vsapi.betterjs.dev/download/{}/{}/",
        version, platform
    );
    let res = reqwest::get(&url)
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

#[command]
async fn initialize_game(path: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path).join("Mods");
    if !pb.exists() {
        std::fs::create_dir_all(&pb).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory: {e}"),
        })?;
    }
    Ok("initialized".into())
}

#[command]
async fn add_mod_to_installation(path: String, url: String) -> Result<String, UiError> {
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
async fn fetch_mod_info(modid: String) -> Result<Value, UiError> {
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
async fn auth_verify(uid: String, sessionkey: String) -> Result<AuthVerifyResponse, UiError> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers.insert(HOST, HeaderValue::from_static("auth3.vintagestory.at"));

    let params = [("uid", uid.as_str()), ("sessionkey", sessionkey.as_str())];

    let res = client
        .post("https://auth3.vintagestory.at/clientvalidate")
        .headers(headers)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json_response = res
        .json::<AuthVerifyResponse>()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    if json_response.valid == 0 {
        return Err(UiError {
            name: "invalid_session".into(),
            message: json_response
                .reason
                .unwrap_or("Invalid session".to_string()),
        });
    }

    Ok(json_response)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GameLoginResponse {
    pub sessionkey: Option<String>,
    pub sessionsignature: Option<String>,
    pub mptoken: Option<String>,
    pub uid: Option<String>,
    pub entitlements: Option<serde_json::Value>,
    pub playername: Option<String>,
    pub hasgameserver: Option<bool>,
    pub valid: u8,
    pub reason: Option<String>,
    pub prelogintoken: Option<String>,
}

#[command]
async fn auth_login(
    email: String,
    password: String,
    totpcode: Option<String>,
    prelogintoken: Option<String>,
) -> Result<GameLoginResponse, UiError> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers.insert(HOST, HeaderValue::from_static("auth3.vintagestory.at"));

    let params = [
        ("email", email.as_str()),
        ("password", password.as_str()),
        ("totpcode", totpcode.as_deref().unwrap_or("")),
        ("prelogintoken", prelogintoken.as_deref().unwrap_or("")),
        ("gameloginversion", "1.21.0"),
    ];

    let res = client
        .post("https://auth3.vintagestory.at/v2/gamelogin")
        .headers(headers)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Request error: {e}"))?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json_response = res
        .json::<GameLoginResponse>()
        .await
        .map_err(|e| format!("JSON error: {e}"))?;

    if json_response.valid == 0 {
        if json_response.prelogintoken.is_some() {
            return Err(UiError {
                name: json_response
                    .prelogintoken
                    .unwrap_or("prelogin_required".to_string()),
                message: json_response
                    .reason
                    .unwrap_or("Pre-login required".to_string()),
            });
        }
        return Err(UiError {
            name: "invalid_login".into(),
            message: json_response.reason.unwrap_or("Invalid login".to_string()),
        });
    }

    Ok(json_response)
}

#[cfg(target_os = "windows")]
fn find_vintage_story_exe() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    // Try reading from a known registry key (example, may need adjustment)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\Vintage Story") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            let exe = PathBuf::from(path).join("Vintage Story.exe");
            if exe.exists() {
                return Some(exe);
            }
        }
    }
    None
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn find_vintage_story_exe() -> Option<PathBuf> {
    use std::env;

    let home = env::var("HOME").unwrap_or_default();
    let candidates = [
        "/usr/local/bin/Vintage Story",
        "/opt/VintageStory/Vintage Story",
        &format!(
            "{}/.local/share/Steam/steamapps/common/VintageStory/Vintage Story",
            home
        ),
        "/Applications/Vintage Story.app/Vintagestory",
        &format!("{}/Applications/Vintage Story.app/Vintagestory", home),
    ];

    for path in candidates {
        let pb = PathBuf::from(path);
        if pb.exists() && pb.is_file() {
            return Some(pb);
        }
    }

    // Optionally, check $PATH
    if let Ok(path) = which::which("Vintagestory") {
        return Some(path);
    }

    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectResult {
    pub path: String,
    pub version: Option<String>,
}

#[command]
async fn detect_vintage_story_exe() -> Result<DetectResult, UiError> {
    let path = find_vintage_story_exe()
        .and_then(|path| path.parent().map(|p| p.to_string_lossy().into_owned()))
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: "Could not find Vintage Story installation.".into(),
        })?;

    let launch_file = if cfg!(target_os = "windows") {
        "Vintage Story.exe"
    } else {
        "Vintagestory"
    };

    let version = Command::new(format!("{}/{}", path, launch_file))
        .arg("--version")
        .output()
        .map_err(|e| UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        })?;

    Ok(DetectResult {
        path,
        version: String::from_utf8(version.stdout)
            .ok()
            .map(|s| s.trim().to_string()),
    })
}

#[command]
fn confirm_vintage_story_exe(path: String) -> Result<String, UiError> {
    let pb = PathBuf::from(path);
    if pb.exists() && pb.is_file() {
        Ok(pb.to_string_lossy().into_owned())
    } else {
        Err(UiError {
            name: "not_found".into(),
            message: "Could not find Vintage Story executable.".into(),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayGameParams {
    pub installation_id: u64,
    pub server: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub uid: String,
    pub playername: String,
    pub sessionkey: String,
    pub sessionsignature: String,
}

#[command]
fn play_game(app: AppHandle, options: Option<PlayGameParams>) -> Result<String, UiError> {
    let options = options.ok_or_else(|| UiError {
        name: "invalid_params".into(),
        message: "Invalid play game parameters.".into(),
    })?;
    let installation_zustand = app.zustand().get("installations", "installations").unwrap();
    let installation_json: Value = serde_json::from_value(installation_zustand).unwrap();
    // Find installation with matching id
    let installation = installation_json
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|inst| inst["id"].as_u64() == Some(options.installation_id))
        })
        .ok_or_else(|| UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", options.installation_id),
        })?;
    let version_path = app
        .path()
        .app_data_dir()
        .unwrap()
        .join("versions")
        .join(installation["version"].as_str().unwrap());
    if !version_path.exists() || !version_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                version_path.to_string_lossy()
            ),
        });
    }
    let pb = PathBuf::from(installation["path"].as_str().unwrap());
    let start_params = installation["startParams"].as_str().unwrap_or("");
    let mut found_exe = false;
    let mut combined_path = PathBuf::from("/");
    for entry in walkdir::WalkDir::new(&version_path) {
        let entry = entry.map_err(|e| UiError::from(format!("walkdir error: {e}")))?;
        if entry.file_type().is_file() {
            let fname = entry.file_name().to_string_lossy();
            if fname.eq_ignore_ascii_case("vintagestory") || fname.eq_ignore_ascii_case("vintagestory.exe") {
                found_exe = true;
                combined_path = entry.path().to_path_buf();
                break;
            }
        }
    }
    if !found_exe {
        return Err(UiError::from("Could not find Vintage Story executable in installation path"));
    }
    if !combined_path.exists() || !combined_path.is_file() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Launch file not found: {}", combined_path.to_string_lossy()),
        });
    }
    let account_zustand = app
        .zustand()
        .get("accounts", "selectedUser")
        .ok_or_else(|| UiError {
            name: "no_account".into(),
            message: "No account selected".into(),
        })?;
    let account: Value = serde_json::from_value(account_zustand).unwrap();
    if account.is_null() {
        return Err(UiError {
            name: "no_account".into(),
            message: "No account selected".into(),
        });
    }
    let settings = json!({
        "stringSettings": {
            "playeruid": account["uid"].as_str().unwrap_or(""),
            "sessionkey": account["sessionkey"].as_str().unwrap_or(""),
            "sessionsignature": account["sessionsignature"].as_str().unwrap_or(""),
            "playername": account["playername"].as_str().unwrap_or(""),
        }
    });
    let settings_path = pb.join("clientsettings.json");
    // It should create the file if it does not exist, but if it exists it should just overwrite the keys
    if settings_path.exists() {
        let mut existing_settings = String::new();
        File::open(&settings_path)
            .and_then(|mut f| f.read_to_string(&mut existing_settings))
            .map_err(|e| UiError {
                name: "read_failed".into(),
                message: format!("Failed to read existing clientsettings.json: {e}"),
            })?;
        let mut existing_json: Value =
            serde_json::from_str(&existing_settings).unwrap_or(json!({}));
        if let Some(obj) = existing_json.as_object_mut() {
            if let Some(string_settings) = obj
                .get_mut("stringSettings")
                .and_then(|v| v.as_object_mut())
            {
                for (k, v) in settings["stringSettings"].as_object().unwrap() {
                    string_settings.insert(k.clone(), v.clone());
                }
            } else {
                obj.insert("stringSettings".into(), settings["stringSettings"].clone());
            }
        }
        std::fs::write(
            &settings_path,
            serde_json::to_string_pretty(&existing_json).unwrap(),
        )
        .map_err(|e| UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        })?;
        return Command::new(&combined_path.as_os_str())
            .args(&["--dataPath", &pb.as_path().to_string_lossy()])
            .args(
                &options
                    .server
                    .as_ref()
                    .map(|s| vec!["--connect", s.as_str()])
                    .unwrap_or_default(),
            )
            .args(
                &options
                    .password
                    .as_ref()
                    .map(|p| vec!["--password", p.as_str()])
                    .unwrap_or_default(),
            )
            .args(&start_params.split_whitespace().collect::<Vec<&str>>())
            .spawn()
            .map_err(|e| UiError {
                name: "launch_failed".into(),
                message: format!("Failed to launch: {e}"),
            })
            .map(|_| "started".into());
    } else {
        std::fs::create_dir_all(&settings_path.parent().unwrap()).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create directory for clientsettings.json: {e}"),
        })?;
        std::fs::write(
            &settings_path,
            serde_json::to_string_pretty(&settings).unwrap(),
        )
        .map_err(|e| UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        })?;
    }
    Command::new(&combined_path)
        .args(&["--dataPath", &pb.as_path().to_string_lossy()])
        .args(
            &options
                .server
                .as_ref()
                .map(|s| vec!["--connect", s.as_str()])
                .unwrap_or_default(),
        )
        .args(
            &options
                .password
                .as_ref()
                .map(|p| vec!["--password", p.as_str()])
                .unwrap_or_default(),
        )
        .args(&start_params.split_whitespace().collect::<Vec<&str>>())
        .spawn()
        .map_err(|e| UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        })?;
    Ok("started".into())
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
fn remove_installed_version(version: String, app: AppHandle) -> Result<String, UiError> {
    let versions_path = app
        .path()
        .app_data_dir()
        .unwrap()
        .join("versions")
        .join(&version);
    if !versions_path.exists() || !versions_path.is_dir() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!(
                "Version directory not found: {}",
                versions_path.to_string_lossy()
            ),
        });
    }
    std::fs::remove_dir_all(&versions_path).map_err(|e| UiError {
        name: "remove_failed".into(),
        message: format!("Failed to remove version directory: {e}"),
    })?;
    Ok("removed".into())
}

#[command]
fn get_mods(path: String) -> Result<ModsResult, UiError> {
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
async fn get_mod_updates(params: String) -> Result<Value, UiError> {
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
    let json: Value = serde_json::from_str(&res_text).map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    phase: &'static str, // "download" | "extract"
    downloaded: Option<u64>,
    total: Option<u64>,
    percent: Option<f64>,
    current: Option<u64>, // for extract: files processed
    count: Option<u64>,   // for extract: total files considered
    message: Option<String>,
}

#[tauri::command]
async fn download_and_maybe_extract<R: Runtime>(
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
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
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
fn reveal_in_file_explorer(path: String) -> Result<String, UiError> {
    let path = Path::new(&path);

    if cfg!(target_os = "windows") {
        // If it's a file, use /select, to highlight it. If it's a dir, just open it.
        if path.is_file() {
            Command::new("explorer")
                .args(["/select,", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        } else {
            Command::new("explorer")
                .arg(path.as_os_str().to_string_lossy().into_owned())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open explorer: {e}")))?;
        }
    } else if cfg!(target_os = "macos") {
        if path.is_dir() {
            Command::new("open")
                .arg(&path.as_os_str())
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        } else {
            Command::new("open")
                .args(["-R", &path.as_os_str().to_string_lossy()])
                .status()
                .map_err(|e| UiError::from(format!("Failed to open Finder: {e}")))?;
        }
    } else if cfg!(target_os = "linux") {
        // Try xdg-open for general desktops.
        // For files, most DEs open the default app; to "reveal", try the folder.
        let target = if path.is_file() {
            path.parent().unwrap_or(Path::new("/"))
        } else {
            path
        };
        // Prefer xdg-open; fall back to common file managers if needed.
        let status = Command::new("xdg-open").arg(target).status();
        if status.is_err() || !status.unwrap().success() {
            // Try common file managers
            let fm_cmds = [
                ("nautilus", vec![target.as_os_str().to_string_lossy().into_owned()]),
                ("dolphin", vec![target.as_os_str().to_string_lossy().into_owned()]),
                ("thunar", vec![target.as_os_str().to_string_lossy().into_owned()]),
                ("pcmanfm", vec![target.as_os_str().to_string_lossy().into_owned()]),
                ("nemo", vec![target.as_os_str().to_string_lossy().into_owned()]),
            ];
            let mut launched = false;
            for (bin, args) in fm_cmds {
                if Command::new("sh")
                    .arg("-c")
                    .arg(format!("command -v {bin} >/dev/null 2>&1"))
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false)
                {
                    let st = Command::new(bin).args(&args).status();
                    if st.is_ok() && st.unwrap().success() {
                        launched = true;
                        break;
                    }
                }
            }
            if !launched {
                return Err(UiError {
                    name: "no_file_manager".into(),
                    message: "Could not find a file manager to open the path.".into(),
                });
            }
        }
    } else {
        return Err(UiError {
            name: "unsupported_platform".into(),
            message: "This platform is not supported for revealing files.".into(),
        });
    }

    Ok(path.as_os_str().to_string_lossy().to_string())
}

#[command]
fn get_installation_mods(app: AppHandle, id: i64) -> Result<Vec<OutputMod>, UiError> {
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
fn remove_installation(app: AppHandle, id: i64) -> Result<String, UiError> {
    let installations_zustand = app.zustand().get("installations", "installations").unwrap();
    let mut installations_json: Value = serde_json::from_value(installations_zustand).unwrap();
    let installations_array = installations_json.as_array_mut().ok_or_else(|| UiError {
        name: "invalid_data".into(),
        message: "Installations data is not an array".into(),
    })?;
    let index = installations_array
        .iter()
        .position(|inst| inst["id"].as_i64() == Some(id));
    if let Some(idx) = index {
        let installation = &installations_array[idx];
        let path = installation["path"].as_str().unwrap_or("");
        // Remove the installation directory
        let pb = PathBuf::from(path);
        if pb.exists() && pb.is_dir() {
            std::fs::remove_dir_all(&pb).map_err(|e| UiError {
                name: "remove_failed".into(),
                message: format!("Failed to remove installation directory: {e}"),
            })?;
        }
        Ok("removed".into())
    } else {
        Err(UiError {
            name: "not_found".into(),
            message: format!("Installation with id {} not found", id),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModRemoveParams {
    pub path: String,
    pub modpath: String,
}

#[command]
async fn remove_mod_from_installation(params: ModRemoveParams) -> Result<String, UiError> {
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

#[command]
fn get_installed_versions(app: AppHandle) -> Result<Vec<String>, UiError> {
    // Should look up the versions folder and return a list of installed versions
    let base_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app local data dir");
    let versions_dir = base_dir.join("versions");
    if !versions_dir.exists() || !versions_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut versions = vec![];
    for entry in std::fs::read_dir(versions_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read versions directory: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read directory entry: {e}"),
        })?;
        if entry.path().is_dir() {
            if let Some(name) = entry.file_name().to_str() {
                versions.push(name.to_string());
            }
        }
    }
    Ok(versions)
}

#[command]
async fn fetch_public_servers() -> Result<Value, UiError> {
    let client = reqwest::Client::new();
    let url = "https://masterserver.vintagestory.at/api/v1/servers/list";
    let res = client
        .get(url)
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
    let json: Value = serde_json::from_str(&res_text)
        .map_err(|e| UiError::from(format!("Parse error: {e}")))?;
    Ok(json)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_zustand::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            auth_login,
            auth_verify,
            fetch_news,
            fetch_versions,
            fetch_mod_tags,
            fetch_mods,
            fetch_authors,
            play_game,
            detect_vintage_story_exe,
            confirm_vintage_story_exe,
            get_mods,
            get_download_links,
            get_download_link,
            initialize_game,
            reveal_in_file_explorer,
            get_installed_versions,
            remove_installed_version,
            remove_installation,
            get_installation_mods,
            fetch_mod_info,
            add_mod_to_installation,
            remove_mod_from_installation,
            download_and_maybe_extract,
            get_mod_updates,
            fetch_public_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
