use std::fs::read_to_string;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::time::Instant;
use tauri::Manager;

static STARTUP_START: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));
static WEBVIEW_START: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));

/// Record the instant when Rust setup finishes (webview load about to begin).
pub fn mark_webview_start() {
    *WEBVIEW_START.lock().unwrap() = Some(Instant::now());
}

/// Log the gap between Rust setup completion and first frontend execution.
#[tauri::command]
pub fn log_webview_gap() -> Result<(), String> {
    if let Some(start) = WEBVIEW_START.lock().unwrap().take() {
        let elapsed = start.elapsed();
        log::info!("Webview load gap: {:.2?}", elapsed);
    }
    Ok(())
}

/// Write a log message with the given level.
///
/// Called by the exported macros and the frontend `log_message` command.
/// The actual destination is managed by `tauri-plugin-log`.
pub fn log(level: &str, msg: &str) {
    STARTUP_START
        .lock()
        .unwrap()
        .get_or_insert_with(Instant::now);
    match level.trim() {
        "INFO" | "INFO " => log::info!("{msg}"),
        "DEBUG" | "DEBUG " => log::debug!("{msg}"),
        "ERROR" | "ERROR " => log::error!("{msg}"),
        _ => log::info!("{msg}"),
    }
}

/// Write a message from the frontend to the log file.
#[tauri::command]
pub fn log_message(level: String, message: String) -> Result<(), String> {
    log(&level, &message);
    Ok(())
}

/// Log the time elapsed since the given `Instant` under a label.
pub fn log_elapsed(label: &str, start: std::time::Instant) {
    let elapsed = start.elapsed();
    log::info!("{label}: {:.2?}", elapsed);
}

/// Log the time elapsed from the first `log()` call to now.
#[tauri::command]
pub fn log_startup_time() -> Result<(), String> {
    if let Some(start) = STARTUP_START.lock().unwrap().take() {
        let elapsed = start.elapsed();
        log::info!("Startup time: {:.2?}", elapsed);
    }
    Ok(())
}

/// Read the current log file and return its contents.
#[tauri::command]
pub fn get_logs(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let log_path = app_data.join("logs").join("app.log");
    if !log_path.exists() {
        return Ok(String::new());
    }
    read_to_string(&log_path).map_err(|e| format!("Failed to read log file: {e}"))
}
