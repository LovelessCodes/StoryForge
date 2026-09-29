use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, HOST};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{command, State};

use super::errors::UiError;
use crate::{log_error, log_info};

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
    #[serde(default)]
    pub hasgameserver: bool,
    pub reason: Option<String>,
}

/// Error returned by `login`.
///
/// The pre-login challenge carries a token the frontend must resend. It lives
/// in a dedicated field so `name` stays a stable error code and session tokens
/// never leak into it.
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum LoginError {
    Ui(UiError),
    Prelogin(PreloginChallenge),
}

#[derive(Debug, Serialize)]
pub struct PreloginChallenge {
    pub name: String,
    pub message: String,
    pub prelogintoken: String,
}

impl From<UiError> for LoginError {
    fn from(e: UiError) -> Self {
        Self::Ui(e)
    }
}

impl From<String> for LoginError {
    fn from(s: String) -> Self {
        Self::Ui(s.into())
    }
}

impl From<&str> for LoginError {
    fn from(s: &str) -> Self {
        Self::Ui(s.into())
    }
}

#[command]
pub async fn verify(
    client: State<'_, Arc<reqwest::Client>>,
    uid: String,
    sessionkey: String,
) -> Result<AuthVerifyResponse, UiError> {
    log_info!("verify: uid={}", uid);
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
        .map_err(|e| {
            log_error!("auth: Request error: {e}");

            format!("Request error: {e}")
        })?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let response_text = res.text().await.map_err(|e| {
        log_error!("auth: Read error: {e}");
        format!("Read error: {e}")
    })?;

    let json_response: AuthVerifyResponse = serde_json::from_str(&response_text).map_err(|e| {
        log_error!("auth: Parse error: {e}");
        format!("Parse error: {e}")
    })?;

    // Never log the response body: it contains the mptoken and entitlements.
    log_info!(
        "verify: valid={} has_entitlements={} has_gameserver={}",
        json_response.valid,
        json_response.entitlements.is_some(),
        json_response.hasgameserver
    );

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
    client: State<'_, Arc<reqwest::Client>>,
    email: String,
    password: String,
    totpcode: Option<String>,
    prelogintoken: Option<String>,
) -> Result<GameLoginResponse, LoginError> {
    log_info!("login: email={}", redact_email(&email));
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
        .map_err(|e| {
            log_error!("auth: Request error: {e}");

            format!("Request error: {e}")
        })?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        }
        .into());
    }

    let json_response = res.json::<GameLoginResponse>().await.map_err(|e| {
        log_error!("auth: JSON error: {e}");

        format!("JSON error: {e}")
    })?;

    if json_response.valid == 0 {
        if let Some(token) = json_response.prelogintoken {
            return Err(LoginError::Prelogin(PreloginChallenge {
                name: "prelogin_required".into(),
                message: json_response
                    .reason
                    .unwrap_or("Pre-login required".to_string()),
                prelogintoken: token,
            }));
        }
        return Err(UiError {
            name: "invalid_login".into(),
            message: json_response.reason.unwrap_or("Invalid login".to_string()),
        }
        .into());
    }

    Ok(json_response)
}

// ── Account persistence ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedAccount {
    pub uid: Option<String>,
    pub email: String,
    pub playername: Option<String>,
    pub sessionkey: Option<String>,
    pub sessionsignature: Option<String>,
    #[serde(default)]
    pub selected: bool,
}

#[command]
pub fn save_accounts(app: tauri::AppHandle, accounts: Vec<SavedAccount>) -> Result<(), String> {
    use std::fs::write;
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| format!("{e}"))?;
    let path = data_dir.join("accounts.json");
    let json = serde_json::to_string_pretty(&accounts).map_err(|e| format!("{e}"))?;
    write(&path, json).map_err(|e| format!("{e}"))
}

#[command]
pub fn load_accounts(app: tauri::AppHandle) -> Result<Vec<SavedAccount>, String> {
    use std::fs::read_to_string;
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().map_err(|e| format!("{e}"))?;
    let path = data_dir.join("accounts.json");

    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = read_to_string(&path).map_err(|e| format!("{e}"))?;
    serde_json::from_str(&json).map_err(|e| format!("{e}"))
}

/// Masks the local part of an email address for logs.
///
/// `user@example.com` becomes `u***@example.com`, so log files and the bug
/// reports that include them don't carry full user identifiers.
fn redact_email(email: &str) -> String {
    match email.split_once('@') {
        Some((local, domain)) => {
            let first = local.chars().next().map(String::from).unwrap_or_default();
            format!("{first}***@{domain}")
        }
        None => "***".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_email_masks_local_part() {
        assert_eq!(redact_email("user@example.com"), "u***@example.com");
        assert_eq!(redact_email("a@b"), "a***@b");
        assert_eq!(redact_email("not-an-email"), "***");
    }
}
