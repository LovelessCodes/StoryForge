use serde::Serialize;
use thiserror::Error;

/// Frontend-facing error type returned by all Tauri commands.
///
/// Module-level code should use typed errors (via `thiserror`) and convert to
/// `UiError` at the command boundary.
#[derive(Debug, Clone, Serialize, Error)]
#[error("[{name}] {message}")]
pub struct UiError {
    pub name: String,
    pub message: String,
}

impl UiError {
    /// Create a new UI error with the given name and message.
    pub fn new<N, M>(name: N, message: M) -> Self
    where
        N: Into<String>,
        M: Into<String>,
    {
        Self {
            name: name.into(),
            message: message.into(),
        }
    }

    /// Shorthand for an I/O error.
    pub fn io<M: Into<String>>(message: M) -> Self {
        Self::new("io_error", message)
    }

    /// Shorthand for a "not found" error.
    pub fn not_found<M: Into<String>>(message: M) -> Self {
        Self::new("not_found", message)
    }
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

impl From<std::io::Error> for UiError {
    fn from(e: std::io::Error) -> Self {
        UiError::io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ui_error_display() {
        let err = UiError::new("foo", "bar");
        assert_eq!(err.to_string(), "[foo] bar");
    }

    #[test]
    fn test_ui_error_from_string() {
        let err: UiError = "something went wrong".into();
        assert_eq!(err.name, "UNKNOWN");
        assert_eq!(err.message, "something went wrong");
    }

    #[test]
    fn test_ui_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file gone");
        let err: UiError = io_err.into();
        assert_eq!(err.name, "io_error");
        assert!(err.message.contains("file gone"));
    }
}
