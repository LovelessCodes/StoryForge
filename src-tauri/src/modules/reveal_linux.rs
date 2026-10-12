//! Revealing a path in the file manager (Linux).
//!
//! `tauri-plugin-opener` cannot do this reliably: its first attempt
//! (`org.freedesktop.FileManager1.ShowItems`) is unreachable from a sandbox —
//! Flatpak only grants `org.freedesktop.portal.*` by default — and its
//! xdg-desktop-portal fallback addresses the wrong D-Bus name, so sandboxed
//! builds always fail with "Failed to open file manager" (see issue #236).
//!
//! We ask `xdg-desktop-portal` instead, which works inside and outside
//! sandboxes alike: `OpenURI.OpenDirectory` reveals the path through the host's
//! file manager (the portal itself drives
//! `org.freedesktop.FileManager1.ShowItems` and opens the containing folder
//! when that service is missing).

use std::{
    fs::File,
    io::Read,
    os::fd::AsFd,
    path::Path,
    process::{Command, Stdio},
};

use super::errors::UiError;

/// xdg-desktop-portal D-Bus coordinates: the interface is `OpenURI` while the
/// bus name is `Desktop`. The opener plugin swaps the two and ends up calling a
/// bus name that does not exist.
const PORTAL_BUS_NAME: &str = "org.freedesktop.portal.Desktop";
const PORTAL_OBJECT_PATH: &str = "/org/freedesktop/portal/desktop";
const PORTAL_OPEN_URI: &str = "org.freedesktop.portal.OpenURI";

/// Reveals `path` (which must exist) in the user's file manager.
pub fn reveal(path: &Path) -> Result<(), UiError> {
    match reveal_with_portal(path) {
        Ok(()) => Ok(()),
        Err(portal_error) => {
            crate::log_error!(
                "reveal: xdg-desktop-portal failed for {}: {portal_error}",
                path.display()
            );

            match reveal_with_xdg_open(path) {
                Ok(()) => Ok(()),
                Err(fallback_error) => {
                    crate::log_error!(
                        "reveal: xdg-open fallback failed for {}: {fallback_error}",
                        path.display()
                    );
                    Err(UiError::new(
                        "reveal_failed",
                        format!("Failed to open file manager: {portal_error}; xdg-open: {fallback_error}"),
                    ))
                }
            }
        }
    }
}

/// `org.freedesktop.portal.OpenURI.OpenDirectory(parent_window, fd, options)`
/// opens the folder holding the file descriptor and selects the item.
fn reveal_with_portal(path: &Path) -> Result<(), String> {
    use std::collections::HashMap;

    use zbus::zvariant::{Fd, Value};

    let file = File::open(path).map_err(|e| e.to_string())?;
    // Empty a{sv}: the portal derives its own request handle token.
    let options = HashMap::<&str, Value<'_>>::new();

    let connection = zbus::blocking::Connection::session().map_err(|e| e.to_string())?;
    connection
        .call_method(
            Some(PORTAL_BUS_NAME),
            PORTAL_OBJECT_PATH,
            Some(PORTAL_OPEN_URI),
            "OpenDirectory",
            &("", Fd::from(file.as_fd()), options),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Last resort when no portal is reachable: let `xdg-open` pick the default
/// file manager. Unlike the portal this does not select the folder.
fn reveal_with_xdg_open(path: &Path) -> Result<(), String> {
    let mut child = Command::new("xdg-open")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    // Reap the opener in the background; its stderr explains failures.
    std::thread::spawn(move || {
        let mut stderr = String::new();
        if let Some(mut pipe) = child.stderr.take() {
            let _ = pipe.read_to_string(&mut stderr);
        }

        match child.wait() {
            Ok(status) if !status.success() => crate::log_error!(
                "reveal: xdg-open failed for the requested path: {status}: {}",
                stderr.trim()
            ),
            Ok(_) => {}
            Err(e) => crate::log_error!("reveal: xdg-open wait failed: {e}"),
        }
    });

    Ok(())
}
