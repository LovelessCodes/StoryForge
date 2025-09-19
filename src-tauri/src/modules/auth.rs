use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, HOST};
use serde::{Deserialize, Serialize};
use tauri::command;

use super::errors::UiError;

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

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthVerifyResponse {
    pub valid: u8,
    pub entitlements: Option<String>,
    pub mptoken: Option<String>,
    pub hasgameserver: bool,
    pub reason: Option<String>,
}

#[command]
pub async fn verify(uid: String, sessionkey: String) -> Result<AuthVerifyResponse, UiError> {
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

#[command]
pub async fn login(
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
