use super::errors::UiError;
use super::utils::lock;
use std::fs::read_to_string;
use std::sync::LazyLock;
use std::sync::Mutex;
use std::time::Instant;
use tauri::Manager;

static STARTUP_START: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));
static WEBVIEW_START: LazyLock<Mutex<Option<Instant>>> = LazyLock::new(|| Mutex::new(None));

/// Record the instant when Rust setup finishes (webview load about to begin).
pub fn mark_webview_start() {
    *lock(&WEBVIEW_START) = Some(Instant::now());
}

/// Log the gap between Rust setup completion and first frontend execution.
#[tauri::command]
pub fn log_webview_gap() -> Result<(), UiError> {
    if let Some(start) = lock(&WEBVIEW_START).take() {
        let elapsed = start.elapsed();
        log::info!("Webview load gap: {:.2?}", elapsed);
    }
    Ok(())
}

/// Keys whose values are credentials and must never reach the log file.
const SECRET_KEYS: &[&str] = &[
    "password",
    "passwd",
    "sessionkey",
    "session_key",
    "prelogintoken",
    "mptoken",
    "token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
];

const REDACTED: &str = "***";

/// Write a log message with the given level.
///
/// Called by the exported macros and the frontend `log_message` command.
/// The actual destination is managed by `tauri-plugin-log`.
pub fn log(level: &str, msg: &str) {
    lock(&STARTUP_START).get_or_insert_with(Instant::now);
    let msg = redact_secrets(msg);
    match level.trim() {
        "INFO" | "INFO " => log::info!("{msg}"),
        "DEBUG" | "DEBUG " => log::debug!("{msg}"),
        "ERROR" | "ERROR " => log::error!("{msg}"),
        _ => log::info!("{msg}"),
    }
}

/// Replace credential values in `message` with `***`.
///
/// Log files are the artefact users attach to bug reports, so credentials must
/// not survive into them. Handles `key=value`, `key: value`, quoted values
/// (including escaped quotes), `Authorization: Bearer <token>` and query
/// strings.
fn redact_secrets(message: &str) -> String {
    let lower = message.to_ascii_lowercase();
    let bytes = message.as_bytes();
    let mut out = String::with_capacity(message.len());
    let mut cursor = 0;

    while cursor < bytes.len() {
        let Some((key_start, key)) = find_secret_key(&lower, bytes, cursor) else {
            break;
        };
        let Some((value_start, value_end)) = secret_value_range(bytes, key, key_start + key.len())
        else {
            cursor = key_start + key.len();
            continue;
        };
        if value_start < cursor {
            cursor = value_end;
            continue;
        }
        out.push_str(&message[cursor..value_start]);
        out.push_str(REDACTED);
        cursor = value_end;
    }
    out.push_str(&message[cursor..]);
    out
}

/// Earliest secret key at or after `from` that is followed by a value.
fn find_secret_key(haystack: &str, bytes: &[u8], from: usize) -> Option<(usize, &'static str)> {
    let mut best: Option<(usize, &'static str)> = None;
    for key in SECRET_KEYS {
        for (offset, _) in haystack[from..].match_indices(key) {
            let start = from + offset;
            let end = start + key.len();
            if best.is_some_and(|(best_start, _)| start >= best_start) {
                break;
            }
            if !is_key_boundary(bytes, start, end) {
                continue;
            }
            if secret_value_range(bytes, key, end).is_some() {
                best = Some((start, key));
                break;
            }
        }
    }
    best
}

/// Whether a key match is a whole word rather than part of a longer identifier.
fn is_key_boundary(bytes: &[u8], start: usize, end: usize) -> bool {
    let before_ok = start == 0 || !is_key_byte(bytes[start - 1]);
    let after_ok = end == bytes.len() || !is_key_byte(bytes[end]);
    before_ok && after_ok
}

fn is_key_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Byte range of the value that follows `key`, if the key has one.
fn secret_value_range(bytes: &[u8], key: &str, from: usize) -> Option<(usize, usize)> {
    let mut i = from;
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t') {
        i += 1;
    }
    if !matches!(bytes.get(i), Some(b'=') | Some(b':')) {
        return None;
    }
    i += 1;
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t') {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }

    if key == "authorization" {
        if let Some(scheme_end) = http_auth_scheme_end(bytes, i) {
            i = scheme_end;
        }
    }
    if i >= bytes.len() {
        return None;
    }

    let start = i;
    let end = match bytes[i] {
        b'\'' | b'"' => quoted_value_end(bytes, i),
        _ => unquoted_value_end(bytes, i),
    };
    (end > start).then_some((start, end))
}

/// End of a leading `Bearer`/`Basic`/`Digest` scheme, so the token after it is
/// redacted while the scheme stays readable.
fn http_auth_scheme_end(bytes: &[u8], from: usize) -> Option<usize> {
    for scheme in [b"bearer".as_slice(), b"basic", b"digest"] {
        let end = from + scheme.len();
        if end < bytes.len()
            && bytes[from..end].eq_ignore_ascii_case(scheme)
            && matches!(bytes[end], b' ' | b'\t')
        {
            let mut i = end;
            while i < bytes.len() && matches!(bytes[i], b' ' | b'\t') {
                i += 1;
            }
            return Some(i);
        }
    }
    None
}

/// End of a quoted value, honouring backslash escapes. An unterminated quote
/// extends to the end of the line so a partial value cannot leak.
fn quoted_value_end(bytes: &[u8], start: usize) -> usize {
    let quote = bytes[start];
    let mut i = start + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            byte if byte == quote => return i + 1,
            _ => i += 1,
        }
    }
    bytes.len()
}

fn unquoted_value_end(bytes: &[u8], start: usize) -> usize {
    let mut i = start;
    while i < bytes.len() && !is_value_delimiter(bytes[i]) {
        i += 1;
    }
    i
}

fn is_value_delimiter(byte: u8) -> bool {
    byte.is_ascii_whitespace()
        || matches!(
            byte,
            b',' | b'}' | b']' | b')' | b'&' | b';' | b'\'' | b'"' | b'#'
        )
}

/// Write a message from the frontend to the log file.
#[tauri::command]
pub fn log_message(level: String, message: String) -> Result<(), UiError> {
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
pub fn log_startup_time() -> Result<(), UiError> {
    if let Some(start) = lock(&STARTUP_START).take() {
        let elapsed = start.elapsed();
        log::info!("Startup time: {:.2?}", elapsed);
    }
    Ok(())
}

/// Read the current log file and return its contents.
#[tauri::command]
pub fn get_logs(app: tauri::AppHandle) -> Result<String, UiError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| UiError::new("path_error", format!("Failed to resolve app data dir: {e}")))?;
    let log_path = app_data.join("logs").join("app.log");
    if !log_path.exists() {
        return Ok(String::new());
    }
    read_to_string(&log_path)
        .map_err(|e| UiError::new("io_error", format!("Failed to read log file: {e}")))
}

#[cfg(test)]
mod tests {
    use super::redact_secrets;

    #[test]
    fn redacts_key_value_credentials() {
        assert_eq!(
            redact_secrets("login: email=u***@example.com password=hunter2"),
            "login: email=u***@example.com password=***"
        );
        assert_eq!(
            redact_secrets("sessionkey=abc; user=alice"),
            "sessionkey=***; user=alice"
        );
        assert_eq!(redact_secrets("PASSWORD = \"hunter2\""), "PASSWORD = ***");
        assert_eq!(redact_secrets("api_key=abc"), "api_key=***");
        assert_eq!(redact_secrets("apikey: abc"), "apikey: ***");
    }

    #[test]
    fn redacts_quoted_values_with_escaped_quotes() {
        assert_eq!(
            redact_secrets("Password: 'it\\'s secret' port=8080"),
            "Password: *** port=8080"
        );
    }

    #[test]
    fn redacts_authorization_schemes() {
        assert_eq!(
            redact_secrets("Authorization: Bearer abc.def-123"),
            "Authorization: Bearer ***"
        );
        assert_eq!(
            redact_secrets("authorization: Basic dXNlcjpwYXNz"),
            "authorization: Basic ***"
        );
    }

    #[test]
    fn redacts_query_string_tokens() {
        assert_eq!(
            redact_secrets("download: https://host/file?token=abc123&size=2"),
            "download: https://host/file?token=***&size=2"
        );
    }

    #[test]
    fn redacts_multiple_values_and_prefixed_keys() {
        assert_eq!(
            redact_secrets("prelogintoken=tok1 token=tok2"),
            "prelogintoken=*** token=***"
        );
    }

    #[test]
    fn leaves_non_credentials_alone() {
        for message in [
            "password_set=true",
            "tokenizer loaded",
            "no secret here",
            "session check: valid=true",
        ] {
            assert_eq!(redact_secrets(message), message);
        }
    }
}
