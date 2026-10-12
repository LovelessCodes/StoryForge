//! Reveals a path in the platform file manager.
//!
//! macOS and Windows keep using `tauri-plugin-opener`. Linux talks to
//! xdg-desktop-portal directly, see [`super::reveal_linux`].

use std::path::Path;

use tauri::AppHandle;

use super::errors::UiError;

/// Reveals `path` in the file manager. The path must already exist.
pub fn reveal_in_file_manager(app: &AppHandle, path: &Path) -> Result<(), UiError> {
    #[cfg(target_os = "linux")]
    fn imp(_app: &AppHandle, path: &Path) -> Result<(), UiError> {
        super::reveal_linux::reveal(path)
    }

    #[cfg(not(target_os = "linux"))]
    fn imp(app: &AppHandle, path: &Path) -> Result<(), UiError> {
        use tauri_plugin_opener::OpenerExt;

        app.opener().reveal_item_in_dir(path).map_err(|e| {
            crate::log_error!("reveal: file manager failed for {}: {e}", path.display());
            UiError::new("reveal_failed", format!("Failed to open file manager: {e}"))
        })
    }

    imp(app, path)
}
