use quick_xml::de::from_str;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::command;

use super::errors::UiError;

#[allow(non_snake_case)]
#[derive(Debug, Serialize, Deserialize)]
pub struct NewsItem {
    pub title: String,
    pub link: String,
    pub description: String,
    pub guid: String,
    pub pubDate: String,
}

#[derive(Debug, Deserialize)]
pub struct Channel {
    item: Vec<NewsItem>,
}

#[derive(Debug, Deserialize)]
pub struct Rss {
    channel: Channel,
}

#[command]
pub async fn fetch_news() -> Result<serde_json::Value, UiError> {
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
