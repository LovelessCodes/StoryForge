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
    /// `0` when the response is a failure or challenge (the v2 API omits the
    /// field entirely there).
    #[serde(default)]
    pub valid: u8,
    /// v1 spelling of the failure/challenge code.
    pub reason: Option<String>,
    /// v2 spelling of the failure/challenge code (`requiretotpcode`, …).
    pub message: Option<String>,
    /// v2 error name (`prelogin_required`, …).
    pub name: Option<String>,
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

    classify_login_response(json_response)
}

/// Splits a gamelogin response into success, a pre-login challenge or a
/// failure.
///
/// The v2 API reports the code in `message` (with `name` carrying the stable
/// challenge kind) and omits `valid`; older responses use `reason` with
/// `valid: 0`. Both shapes are accepted.
fn classify_login_response(response: GameLoginResponse) -> Result<GameLoginResponse, LoginError> {
    if response.valid != 0 {
        return Ok(response);
    }

    let code = response.message.clone().or_else(|| response.reason.clone());
    if let Some(token) = response.prelogintoken.clone() {
        return Err(LoginError::Prelogin(PreloginChallenge {
            name: response
                .name
                .clone()
                .unwrap_or_else(|| "prelogin_required".to_string()),
            message: code.unwrap_or_else(|| "Pre-login required".to_string()),
            prelogintoken: token,
        }));
    }

    Err(UiError {
        name: response
            .name
            .clone()
            .unwrap_or_else(|| "invalid_login".to_string()),
        message: code.unwrap_or_else(|| "Invalid login".to_string()),
    }
    .into())
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
pub fn save_accounts(app: tauri::AppHandle, accounts: Vec<SavedAccount>) -> Result<(), UiError> {
    use std::fs::write;
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| UiError::new("path_error", format!("Failed to resolve app data dir: {e}")))?;
    let path = data_dir.join("accounts.json");
    let json = serde_json::to_string_pretty(&accounts).map_err(|e| {
        UiError::new(
            "serialize_error",
            format!("Failed to serialize accounts: {e}"),
        )
    })?;
    write(&path, json)
        .map_err(|e| UiError::new("io_error", format!("Failed to write accounts.json: {e}")))
}

#[command]
pub fn load_accounts(app: tauri::AppHandle) -> Result<Vec<SavedAccount>, UiError> {
    use std::fs::read_to_string;
    use tauri::Manager;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| UiError::new("path_error", format!("Failed to resolve app data dir: {e}")))?;
    let path = data_dir.join("accounts.json");

    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = read_to_string(&path)
        .map_err(|e| UiError::new("io_error", format!("Failed to read accounts.json: {e}")))?;
    serde_json::from_str(&json)
        .map_err(|e| UiError::new("parse_error", format!("Failed to parse accounts.json: {e}")))
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

    #[test]
    fn login_classifies_the_v2_totp_challenge() {
        let response: GameLoginResponse = serde_json::from_str(
            r#"{"message":"requiretotpcode","name":"prelogin_required","prelogintoken":"tok"}"#,
        )
        .expect("challenge response parses");
        match classify_login_response(response).expect_err("challenge expected") {
            LoginError::Prelogin(challenge) => {
                assert_eq!(challenge.message, "requiretotpcode");
                assert_eq!(challenge.name, "prelogin_required");
                assert_eq!(challenge.prelogintoken, "tok");
            }
            other => panic!("expected prelogin challenge, got {other:?}"),
        }
    }

    #[test]
    fn login_classifies_invalid_credentials() {
        let response: GameLoginResponse =
            serde_json::from_str(r#"{"valid":0,"reason":"invalidemailorpassword"}"#)
                .expect("failure response parses");
        match classify_login_response(response).expect_err("failure expected") {
            LoginError::Ui(error) => {
                assert_eq!(error.name, "invalid_login");
                assert_eq!(error.message, "invalidemailorpassword");
            }
            other => panic!("expected ui error, got {other:?}"),
        }
    }

    #[test]
    fn login_passes_success_through() {
        let response: GameLoginResponse =
            serde_json::from_str(r#"{"valid":1,"sessionkey":"s","uid":"u"}"#).expect("parses");
        let ok = classify_login_response(response).expect("valid response");
        assert_eq!(ok.sessionkey.as_deref(), Some("s"));
        assert_eq!(ok.uid.as_deref(), Some("u"));
    }
}
