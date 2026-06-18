//! macOS-specific window styling for the main application window.
//!
//! Vintage Story is launched from a custom Tauri window. On macOS we hide the
//! title bar, make the content view full-size, round the corners, and set a
//! transparent background so the frontend can draw its own chrome.

use objc2::rc::Retained;
use objc2_app_kit::{NSColor, NSWindowStyleMask, NSWindowTitleVisibility};
use tauri::WebviewWindow;

use crate::{log_debug, log_error};

/// Apply macOS window styling. Failures are logged but never fatal.
pub fn apply_window_styling(window: &WebviewWindow) {
    let result = unsafe { try_apply_window_styling(window) };
    if let Err(e) = result {
        log_error!("platform::macos: failed to apply window styling: {e}");
    }
}

/// Inner function that performs the actual Objective-C work.
///
/// # Safety
///
/// Calls into AppKit via `objc2`. All `unsafe` blocks are required by the
/// Objective-C runtime bindings. The function returns an error rather than
/// panicking on unexpected window state.
unsafe fn try_apply_window_styling(window: &WebviewWindow) -> Result<(), String> {
    let raw_ns_window = window
        .ns_window()
        .map_err(|e| format!("failed to get native NSWindow handle: {e}"))?;

    let ns_window: Retained<objc2_app_kit::NSWindow> = Retained::retain(raw_ns_window as *mut _)
        .ok_or_else(|| "failed to retain native NSWindow".to_string())?;

    // Hide the title bar and traffic lights, keep resizable.
    ns_window.setTitlebarAppearsTransparent(true);
    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
    let mut mask = ns_window.styleMask();
    mask.insert(NSWindowStyleMask::FullSizeContentView);
    mask.insert(NSWindowStyleMask::Resizable);
    mask.remove(NSWindowStyleMask::Titled);
    ns_window.setStyleMask(mask);

    // Rounded corners.
    if let Some(content_view) = ns_window.contentView() {
        content_view.setWantsLayer(true);
        if let Some(layer) = content_view.layer() {
            layer.setCornerRadius(12.0);
            layer.setMasksToBounds(true);
        } else {
            log_debug!("platform::macos: content view has no layer; skipping corner radius");
        }
    } else {
        log_debug!("platform::macos: window has no content view; skipping corner radius");
    }

    let bg_color =
        NSColor::colorWithRed_green_blue_alpha(50.0 / 255.0, 158.0 / 255.0, 163.5 / 255.0, 0.0);
    ns_window.setBackgroundColor(Some(&bg_color));

    Ok(())
}
