use serde::Serialize;

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
