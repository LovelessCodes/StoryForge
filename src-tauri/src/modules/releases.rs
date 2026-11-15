//! Newest published release on GitHub.
//!
//! The bundled updater is switched off inside Flatpak, and the app is not on
//! Flathub yet, so a bundle installed by hand has no way of hearing that a
//! newer build exists. This lookup gives Settings a version to compare against;
//! it never downloads or installs anything.

use std::{sync::Arc, time::Duration};

use serde::Serialize;
use tauri::{command, State};

use super::errors::UiError;
use crate::log_error;

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/LovelessCodes/StoryForge/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/LovelessCodes/StoryForge/releases/latest";

#[derive(Serialize)]
pub struct LatestRelease {
    /// Release version without the tag prefix, e.g. `2.0.11`.
    version: String,
    /// Page a user can download the bundle from.
    url: String,
}

#[command]
pub async fn latest_release(
    client: State<'_, Arc<reqwest::Client>>,
) -> Result<Option<LatestRelease>, UiError> {
    let client: &reqwest::Client = &client;
    let response = client
        .get(LATEST_RELEASE_API)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| {
            log_error!("releases: request error: {e}");
            UiError::new("request_error", format!("Request error: {e}"))
        })?;

    // An unauthenticated lookup is rate limited and offline machines cannot
    // reach it at all. Both are "no news", not a failure worth a toast.
    if !response.status().is_success() {
        log_error!("releases: GitHub answered {}", response.status());
        return Ok(None);
    }

    let body: serde_json::Value = response.json().await.map_err(|e| {
        log_error!("releases: parse error: {e}");
        UiError::new("parse_error", format!("Parse error: {e}"))
    })?;

    let Some(version) = body
        .get("tag_name")
        .and_then(|value| value.as_str())
        .and_then(release_version)
    else {
        log_error!("releases: no usable tag in the latest release");
        return Ok(None);
    };

    Ok(Some(LatestRelease {
        version,
        url: body
            .get("html_url")
            .and_then(|value| value.as_str())
            .unwrap_or(RELEASES_PAGE)
            .to_string(),
    }))
}

/// Tags are `storyforge-v2.0.11`; older ones may only carry `v2.0.11`.
fn release_version(tag: &str) -> Option<String> {
    let version = tag.strip_prefix("storyforge-").unwrap_or(tag);
    let version = version.strip_prefix('v').unwrap_or(version);

    let mut parts = version.split('.');
    let is_number = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(major), Some(minor), Some(patch), None)
            if is_number(major) && is_number(minor) && is_number(patch) =>
        {
            Some(version.to_string())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::release_version;

    #[test]
    fn release_tags_lose_their_prefix() {
        assert_eq!(
            release_version("storyforge-v2.0.11").as_deref(),
            Some("2.0.11")
        );
        assert_eq!(release_version("v2.0.11").as_deref(), Some("2.0.11"));
        assert_eq!(release_version("2.0.11").as_deref(), Some("2.0.11"));
    }

    #[test]
    fn release_tags_must_carry_a_version() {
        assert_eq!(release_version("storyforge-nightly"), None);
        assert_eq!(release_version(""), None);
        assert_eq!(release_version("v2.0"), None);
    }
}
