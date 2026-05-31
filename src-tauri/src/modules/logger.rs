use std::{
    fs::{create_dir_all, read_to_string, File},
    io::Write,
    path::PathBuf,
    sync::Mutex,
};

static LOGGER: Mutex<Option<File>> = Mutex::new(None);

/// Initialize the logger. Must be called once at startup.
/// Creates/truncates `<app_data>/logs/app.log`.
pub fn init(app_data: &PathBuf) {
    let log_dir = app_data.join("logs");
    let _ = create_dir_all(&log_dir);
    let log_path = log_dir.join("app.log");
    match File::create(&log_path) {
        Ok(f) => {
            *LOGGER.lock().unwrap() = Some(f);
            let _ = writeln!(
                LOGGER.lock().unwrap().as_mut().unwrap(),
                "── Story Forge log started ──"
            );
        }
        Err(e) => {
            // Can't use log macros here — logger itself failed. Fallback to stderr.
            eprintln!("[logger] Failed to create log file {:?}: {e}", log_path);
        }
    }
}

fn timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs / 3600) % 24;
    let mins = (secs / 60) % 60;
    let secs = secs % 60;
    let millis = now.subsec_millis();
    format!("{hours:02}:{mins:02}:{secs:02}.{millis:03}")
}

/// Write a log message with the given level. Called by the macros.
pub fn log(level: &str, msg: &str) {
    if let Ok(mut guard) = LOGGER.lock() {
        if let Some(ref mut f) = *guard {
            let _ = writeln!(f, "[{}] {} {}", timestamp(), level, msg);
            let _ = f.flush();
        }
    }
}

/// Write a message from the frontend to the log file.
#[tauri::command]
pub fn log_message(level: String, message: String) -> Result<(), String> {
    log(&level, &message);
    Ok(())
}

/// Read the current log file and return its contents
#[tauri::command]
pub fn get_logs(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
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
