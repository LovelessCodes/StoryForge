use serde_json::Value;
use tauri::command;

use super::errors::UiError;

#[command]
pub async fn fetch_public_servers() -> Result<Value, UiError> {
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
