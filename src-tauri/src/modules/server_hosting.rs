use serde::{Deserialize, Serialize};
use std::{
    fs::{create_dir_all, read_dir, read_to_string, remove_dir_all, remove_file, write},
    io::Write as IoWrite,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::{command, AppHandle, Emitter, Manager, State};
use tokio::process::Command;

use super::errors::UiError;
use super::utils::{dir_size, format_size, versions_folder, versions_subdir};
use crate::modules::server_hosting_actor;
use crate::{log_error, log_info};

// ── Data structures ──

/// Persisted per-instance config (stored as server_hosting.json in instance dir)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostedServerInstance {
    pub id: u64, // FNV-1a hash of name
    pub name: String,
    pub version: String,      // e.g. "1.22.3" — must exist in versions dir
    pub port: u16,            // default 42420
    pub bind_ip: String,      // default "0.0.0.0"
    pub data_dir: PathBuf,    // where server data/worlds/Mods/serverconfig.json live
    pub start_params: String, // extra CLI args
    pub favorite: bool,
    pub last_played: Option<u64>,
    pub total_time_played: u64,
}

#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub(crate) enum ServerStatus {
    NotInstalled,
    Stopped,
    Starting,
    Running,
    Stopping,
    Crashed { exit_code: Option<i32> },
}

impl ServerStatus {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            ServerStatus::NotInstalled => "not_installed",
            ServerStatus::Stopped => "stopped",
            ServerStatus::Starting => "starting",
            ServerStatus::Running => "running",
            ServerStatus::Stopping => "stopping",
            ServerStatus::Crashed { .. } => "crashed",
        }
    }
}

/// Whitelist mode stored in serverconfig.json.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum WhitelistMode {
    Off = 1,
    Whitelist = 2,
}

impl WhitelistMode {
    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

impl Default for WhitelistMode {
    fn default() -> Self {
        WhitelistMode::Off
    }
}

/// Whitelist entry — maps to an entry in playerwhitelist.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhitelistEntry {
    pub uid: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub added_by: Option<String>,
}

/// Serializable status info sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct ServerStatusInfo {
    pub status: String,
    pub pid: Option<u32>,
    pub uptime: Option<u64>, // seconds
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DirSizeInfo {
    pub size_bytes: u64,
    pub size_display: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerLogsResponse {
    pub lines: Vec<ServerLogLine>,
    pub next_offset: u64,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerLogLine {
    pub offset: u64,
    pub timestamp: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostedServerPartial {
    pub name: Option<String>,
    pub version: Option<String>,
    pub port: Option<u16>,
    pub bind_ip: Option<String>,
    pub data_dir: Option<String>,
    pub start_params: Option<String>,
    pub favorite: Option<bool>,
    pub last_played: Option<u64>,
    pub total_time_played: Option<u64>,
}

// ── Helpers ──

fn generate_id(name: &str) -> u64 {
    crate::modules::utils::generate_id(name)
}

/// Convert a name to a filesystem-safe slug (lowercase, hyphens, alphanumeric only)
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Simple HH:MM:SS timestamp for log events
fn format_timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs();
    let hours = (total_secs / 3600 + 2) % 24; // UTC+2 approximation
    let minutes = (total_secs / 60) % 60;
    let seconds = total_secs % 60;
    format!("{hours:02}:{minutes:02}:{seconds:02}")
}

/// Unix epoch timestamp for log file lines
fn format_epoch() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_secs())
}

/// Read instance JSON from a data directory
fn read_instance_json(dir: &Path) -> Result<HostedServerInstance, UiError> {
    let file_path = dir.join("server_hosting.json");
    if !file_path.exists() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("server_hosting.json not found in {}", dir.to_string_lossy()),
        });
    }
    let content = read_to_string(&file_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read {}: {e}", file_path.to_string_lossy()),
    })?;
    let instance: HostedServerInstance = serde_json::from_str(&content).map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(instance)
}

fn write_instance_json(dir: &Path, instance: &HostedServerInstance) -> Result<(), UiError> {
    if !dir.exists() {
        create_dir_all(dir).map_err(|e| {
            log_error!("server_hosting: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
        })?;
    }
    let file_path = dir.join("server_hosting.json");
    let content = serde_json::to_string_pretty(instance).map_err(|e| {
        log_error!("server_hosting: serialize_failed: {e}");
        UiError {
            name: "serialize_failed".into(),
            message: format!("Failed to serialize server_hosting.json: {e}"),
        }
    })?;
    write(&file_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write {}: {e}", file_path.to_string_lossy()),
    })?;
    Ok(())
}

/// Scan all instance configs from the hosted-servers directory
fn scan_instances(app: &AppHandle) -> Result<Vec<HostedServerInstance>, UiError> {
    let data_dir = app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })?;
    let instances_dir = data_dir.join("hosted-servers");

    if !instances_dir.exists() || !instances_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut instances = vec![];
    for entry in read_dir(&instances_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read hosting directory: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read directory entry: {e}"),
        })?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let cfg_file = dir.join("server_hosting.json");
        if cfg_file.exists() {
            if let Ok(instance) = read_instance_json(&dir) {
                instances.push(instance);
            }
        }
    }
    Ok(instances)
}

/// Find an instance by ID — scan from hosted-servers dir
fn find_instance(
    app: &AppHandle,
    instance_id: u64,
) -> Result<(PathBuf, HostedServerInstance), UiError> {
    let data_dir = app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })?;
    let instances_dir = data_dir.join("hosted-servers");

    if !instances_dir.exists() {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Instance {instance_id} not found"),
        });
    }

    for entry in read_dir(&instances_dir).map_err(|e| UiError {
        name: "io_error".into(),
        message: format!("Failed to read hosting directory: {e}"),
    })? {
        let entry = entry.map_err(|e| UiError {
            name: "io_error".into(),
            message: format!("Failed to read directory entry: {e}"),
        })?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let cfg_file = dir.join("server_hosting.json");
        if cfg_file.exists() {
            if let Ok(instance) = read_instance_json(&dir) {
                if instance.id == instance_id {
                    return Ok((dir, instance));
                }
            }
        }
    }

    Err(UiError {
        name: "not_found".into(),
        message: format!("Instance {instance_id} not found"),
    })
}

/// Emit a status update event over Tauri
pub(crate) fn emit_status(
    app: &AppHandle,
    instance_id: u64,
    status: &ServerStatus,
    pid: Option<u32>,
    started_at: Option<Instant>,
) {
    log_info!(
        "server_hosting: emitting status for {instance_id}: {}",
        status.as_str()
    );
    let uptime = started_at.map(|s| s.elapsed().as_secs());
    let exit_code = match status {
        ServerStatus::Crashed { exit_code } => *exit_code,
        _ => None,
    };
    let _ = app
        .emit(
            &format!("server-status:{instance_id}"),
            ServerStatusInfo {
                status: status.as_str().to_string(),
                pid,
                uptime,
                exit_code,
            },
        )
        .map_err(|e| log_error!("server_hosting: emit status error: {e}"));
}

/// Emit a log line event for an instance
pub(crate) fn emit_log(app: &AppHandle, instance_id: u64, line: &str) {
    let timestamp = format_timestamp();
    let _ = app.emit(
        &format!("server-log:{instance_id}"),
        serde_json::json!({ "line": line, "timestamp": timestamp }),
    );
}

/// Append a log line to the instance's log file
pub(crate) fn append_log(app: &AppHandle, instance_name: &str, line: &str) {
    let timestamp = format_epoch();
    if let Ok(data_dir) = app.path().app_data_dir() {
        let log_dir = data_dir.join("server-logs");
        let _ = create_dir_all(&log_dir);
        let log_path = log_dir.join(format!("{instance_name}.log"));

        // Rotate if > 10 MB
        if let Ok(meta) = std::fs::metadata(&log_path) {
            if meta.len() > 10 * 1024 * 1024 {
                let rotated = log_dir.join(format!("{instance_name}.1.log"));
                let _ = std::fs::rename(&log_path, &rotated);
            }
        }

        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(file, "[{timestamp}] {line}");
        }
    }
}

/// Full port conflict check: scan all instances on disk
fn full_port_check(
    app: &AppHandle,
    instance_id: u64,
    port: u16,
    bind_ip: &str,
) -> Result<(), UiError> {
    if let Ok(instances) = scan_instances(app) {
        let running_ids = server_hosting_actor::running_instance_ids();
        for inst in &instances {
            if inst.id == instance_id {
                continue;
            }
            if !running_ids.contains(&inst.id) {
                continue;
            }
            if inst.port == port && inst.bind_ip == bind_ip {
                return Err(UiError {
                    name: "port_conflict".into(),
                    message: format!(
                        "Port {bind_ip}:{port} is already in use by instance \"{}\"",
                        inst.name
                    ),
                });
            }
        }
    }
    Ok(())
}

/// Resolve the server executable path for a given version.
/// Finds VintagestoryServer.exe (Windows) or VintagestoryServer (Unix) in the game version folder.
pub(crate) fn server_exe_path(app: &AppHandle, version: &str) -> Result<PathBuf, UiError> {
    let base_dir = versions_folder(app.clone());
    let subdir = versions_subdir(app.clone());
    let version_dir = base_dir.join(&subdir).join(version);

    if !version_dir.exists() {
        return Err(UiError {
            name: "version_not_found".into(),
            message: format!("Version {version} is not installed"),
        });
    }

    // Windows: VintagestoryServer.exe
    #[cfg(target_os = "windows")]
    {
        let exe = version_dir.join("VintagestoryServer.exe");
        if exe.exists() {
            return Ok(exe);
        }
    }

    // Unix (Linux/macOS): VintagestoryServer (shell script that invokes dotnet internally)
    #[cfg(not(target_os = "windows"))]
    {
        // On macOS, the server executable lives inside Vintage Story.app bundle
        #[cfg(target_os = "macos")]
        {
            let app_bundle = version_dir.join("Vintage Story.app");
            if app_bundle.exists() {
                // Typical path: Vintage Story.app/Contents/MacOS/VintagestoryServer
                let bundle_exe = app_bundle
                    .join("Contents")
                    .join("MacOS")
                    .join("VintagestoryServer");
                if bundle_exe.exists() {
                    return Ok(bundle_exe);
                }
                // Fallback: search inside the bundle
                for entry in walkdir::WalkDir::new(&app_bundle).into_iter().flatten() {
                    if entry.file_type().is_file()
                        && entry.file_name().to_string_lossy() == "VintagestoryServer"
                    {
                        return Ok(entry.path().to_path_buf());
                    }
                }
            }
        }

        // Direct VintagestoryServer in version dir (Linux, or macOS fallback)
        let exe = version_dir.join("VintagestoryServer");
        if exe.exists() {
            return Ok(exe);
        }
    }

    // Fallback: try VintagestoryServer.dll (for older/unusual installs)
    let dll = version_dir.join("VintagestoryServer.dll");
    if dll.exists() {
        return Ok(dll);
    }

    Err(UiError {
        name: "server_exe_not_found".into(),
        message: format!("VintagestoryServer executable not found in version {version}. Download the game version first."),
    })
}

// ── Tauri commands ──

// ────────── Instance management ──────────

#[command]
pub async fn create_hosted_server(
    app: AppHandle,
    name: String,
    version: String,
    data_dir: String,
    port: u16,
    bind_ip: String,
    start_params: String,
    password: String,
    whitelist_enabled: bool,
    default_whitelist_uid: String,
    default_whitelist_name: String,
) -> Result<HostedServerInstance, UiError> {
    log_info!("create_hosted_server: name={name} version={version} port={port}");

    // Validate version exists (game version must be downloaded)
    let _ = server_exe_path(&app, &version)?;

    // Validate data_dir — default to {app_data}/servers/{slugified_name}
    let data_path = if data_dir.is_empty() {
        let slug = slugify(&name);
        app.path()
            .app_data_dir()
            .map_err(|e| UiError {
                name: "path_error".into(),
                message: format!("Failed to resolve app data dir: {e}"),
            })?
            .join("servers")
            .join(slug)
    } else {
        PathBuf::from(&data_dir)
    };

    // Validate port not already in use
    let existing = scan_instances(&app)?;
    let running_ids = server_hosting_actor::running_instance_ids();
    for inst in &existing {
        if running_ids.contains(&inst.id) && inst.port == port && inst.bind_ip == bind_ip {
            return Err(UiError {
                name: "port_conflict".into(),
                message: format!(
                    "Port {bind_ip}:{port} is already in use by instance \"{}\"",
                    inst.name
                ),
            });
        }
    }

    let id = generate_id(&name);

    // Create the instance directory under hosted-servers/{id}/
    let app_data_dir = app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })?;
    let instance_dir = app_data_dir.join("hosted-servers").join(id.to_string());

    let instance = HostedServerInstance {
        id,
        name: name.clone(),
        version,
        port,
        bind_ip,
        data_dir: data_path.clone(),
        start_params,
        favorite: false,
        last_played: None,
        total_time_played: 0,
    };

    // Write the instance config into the instance directory (not the data dir)
    write_instance_json(&instance_dir, &instance)?;

    // Ensure data dir exists
    if !data_path.exists() {
        create_dir_all(&data_path).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create data directory: {e}"),
        })?;
    }

    // Generate serverconfig.json via --setconfig flag.
    // This runs the server EXE with --setconfig, which generates a complete
    // serverconfig.json (with all default groups, permissions, etc.) and applies
    // our custom values, then exits immediately.
    let mut setconfig_parts: Vec<String> = Vec::new();
    setconfig_parts.push(format!("Port: {}", port));
    setconfig_parts.push(format!("ServerName: '{}'", name.replace('\'', "\\'")));
    if instance.bind_ip != "0.0.0.0" {
        setconfig_parts.push(format!("Ip: '{}'", instance.bind_ip.replace('\'', "\\'")));
    }
    if !password.is_empty() {
        setconfig_parts.push(format!("Password: '{}'", password.replace('\'', "\\'")));
    }
    setconfig_parts.push(format!(
        "WhitelistMode: {}",
        if whitelist_enabled {
            WhitelistMode::Whitelist.as_u8()
        } else {
            WhitelistMode::Off.as_u8()
        }
    ));
    let setconfig_value = format!("{{ {} }}", setconfig_parts.join(", "));

    let exe_path = server_exe_path(&app, &instance.version)?;
    let data_dir_str = data_path.to_string_lossy().to_string();

    // --setconfig uses = syntax: --setconfig="{ key: 3, foo: 'value' }"
    let setconfig_arg = format!("--setconfig={}", setconfig_value);
    log_info!("create_hosted_server: running --setconfig: exe={:?} dataPath={data_dir_str} arg={setconfig_arg}", exe_path);

    let setconfig_output = Command::new(exe_path.to_string_lossy().as_ref())
        .arg("--dataPath")
        .arg(&data_dir_str)
        .arg(&setconfig_arg)
        .output()
        .await
        .map_err(|e| UiError {
            name: "setconfig_failed".into(),
            message: format!("Failed to run --setconfig: {e}"),
        })?;

    let exit_code = setconfig_output.status.code().unwrap_or(-1);
    // Vintage Story exits with code 200 after --setconfig (success, didn't start server).
    // Exit code 0 is also success. Anything else is a real error.
    if exit_code != 0 && exit_code != 200 {
        let stdout = String::from_utf8_lossy(&setconfig_output.stdout);
        let stderr = String::from_utf8_lossy(&setconfig_output.stderr);
        log_error!("create_hosted_server: --setconfig failed (exit {exit_code}): stdout={stdout} stderr={stderr}");
        return Err(UiError {
            name: "setconfig_failed".into(),
            message: format!("--setconfig failed (exit {exit_code})\n{stdout}\n{stderr}"),
        });
    }
    log_info!("create_hosted_server: --setconfig completed (exit {exit_code}), serverconfig.json generated");

    // If a default whitelist user was provided, create playerwhitelist.json
    if !default_whitelist_uid.is_empty() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let display_name = if default_whitelist_name.is_empty() {
            default_whitelist_uid.clone()
        } else {
            default_whitelist_name.clone()
        };
        let whitelist_entry = WhitelistEntry {
            uid: default_whitelist_uid,
            name: display_name,
            added_at: Some(now),
            added_by: Some("setup".to_string()),
        };
        let whitelist_json =
            serde_json::to_string_pretty(&vec![whitelist_entry]).map_err(|e| UiError {
                name: "serialize_failed".into(),
                message: format!("Failed to serialize playerwhitelist.json: {e}"),
            })?;
        let whitelist_path = data_path.join("playerwhitelist.json");
        write(&whitelist_path, &whitelist_json).map_err(|e| UiError {
            name: "write_failed".into(),
            message: format!("Failed to write playerwhitelist.json: {e}"),
        })?;
        log_info!("create_hosted_server: wrote playerwhitelist.json");
    }

    log_info!("create_hosted_server: created instance id={id}");
    Ok(instance)
}

#[command]
pub async fn get_all_hosted_servers(app: AppHandle) -> Result<Vec<HostedServerInstance>, UiError> {
    log_info!("get_all_hosted_servers");
    scan_instances(&app)
}

#[command]
pub async fn update_hosted_server(
    app: AppHandle,
    instance_id: u64,
    partial: HostedServerPartial,
) -> Result<(), UiError> {
    log_info!("update_hosted_server: id={instance_id}");

    let (dir, mut instance) = find_instance(&app, instance_id)?;

    // Check if running before allowing port/ip changes
    let is_running = server_hosting_actor::is_running(instance_id);

    if let Some(ref name) = partial.name {
        if is_running {
            return Err(UiError {
                name: "instance_running".into(),
                message: "Cannot rename a running instance.".into(),
            });
        }
        instance.name = name.clone();
        instance.id = generate_id(name);
    }
    if let Some(ref version) = partial.version {
        // Validate version exists
        let _ = server_exe_path(&app, version)?;
        instance.version = version.clone();
    }
    if let Some(port) = partial.port {
        if is_running {
            return Err(UiError {
                name: "instance_running".into(),
                message: "Cannot change port while the instance is running.".into(),
            });
        }
        instance.port = port;
    }
    if let Some(ref bind_ip) = partial.bind_ip {
        instance.bind_ip = bind_ip.clone();
    }
    if let Some(ref data_dir) = partial.data_dir {
        instance.data_dir = PathBuf::from(data_dir);
    }
    if let Some(ref start_params) = partial.start_params {
        instance.start_params = start_params.clone();
    }
    if let Some(favorite) = partial.favorite {
        instance.favorite = favorite;
    }
    if let Some(last_played) = partial.last_played {
        instance.last_played = Some(last_played);
    }
    if let Some(total_time_played) = partial.total_time_played {
        instance.total_time_played = total_time_played;
    }

    write_instance_json(&dir, &instance)?;
    Ok(())
}

#[command]
pub async fn delete_hosted_server(
    app: AppHandle,
    instance_id: u64,
    delete_data: bool,
) -> Result<(), UiError> {
    log_info!("delete_hosted_server: id={instance_id} delete_data={delete_data}");

    // Refuse if running
    if server_hosting_actor::is_running(instance_id) {
        return Err(UiError {
            name: "instance_running".into(),
            message: "Stop the instance before deleting it.".into(),
        });
    }

    let (dir, instance) = find_instance(&app, instance_id)?;

    // Remove logs
    if let Ok(data_dir) = app.path().app_data_dir() {
        let log_path = data_dir
            .join("server-logs")
            .join(format!("{}.log", instance.name));
        if log_path.exists() {
            if let Err(e) = remove_file(&log_path) {
                log_error!("delete_hosted_server: failed to remove log: {e}");
            }
        }
    }

    // Remove data directory (worlds, mods, config)
    if delete_data {
        if instance.data_dir != dir {
            if let Err(e) = remove_dir_all(&instance.data_dir) {
                log_error!(
                    "delete_hosted_server: failed to remove data dir {:?}: {e}",
                    instance.data_dir
                );
            }
        }
    }

    // Remove instance config and directory
    let cfg_file = dir.join("server_hosting.json");
    let _ = remove_file(&cfg_file);

    if let Err(e) = remove_dir_all(&dir) {
        log_error!(
            "delete_hosted_server: failed to remove instance dir {:?}: {e}",
            dir
        );
    }

    log_info!("delete_hosted_server: removed id={instance_id}");
    Ok(())
}

// ────────── Lifecycle ──────────

#[command]
pub async fn start_hosted_server(app: AppHandle, instance_id: u64) -> Result<(), UiError> {
    log_info!("start_hosted_server: id={instance_id}");

    let (_dir, instance) = find_instance(&app, instance_id)?;

    if server_hosting_actor::is_running(instance_id) {
        return Err(UiError {
            name: "already_running".into(),
            message: "Instance is already running.".into(),
        });
    }

    full_port_check(&app, instance_id, instance.port, &instance.bind_ip)?;

    if !instance.data_dir.exists() {
        create_dir_all(&instance.data_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create data directory: {e}"),
        })?;
    }

    server_hosting_actor::spawn(app, instance).await
}

#[command]
pub async fn stop_hosted_server(_app: AppHandle, instance_id: u64) -> Result<(), UiError> {
    log_info!("stop_hosted_server: id={instance_id}");
    server_hosting_actor::stop(instance_id).await
}

#[command]
pub async fn restart_hosted_server(app: AppHandle, instance_id: u64) -> Result<(), UiError> {
    log_info!("restart_hosted_server: id={instance_id}");
    stop_hosted_server(app.clone(), instance_id).await.ok();
    tokio::time::sleep(Duration::from_secs(2)).await;
    start_hosted_server(app, instance_id).await
}

async fn send_server_command_internal(instance_id: u64, command: &str) -> Result<(), UiError> {
    server_hosting_actor::send_command(instance_id, command.to_string()).await
}

#[command]
pub async fn send_server_command(instance_id: u64, command: String) -> Result<(), UiError> {
    log_info!("send_server_command: id={instance_id} cmd={command}");
    send_server_command_internal(instance_id, &command).await
}

#[command]
pub async fn get_server_status(instance_id: u64) -> Result<ServerStatusInfo, UiError> {
    Ok(server_hosting_actor::status(instance_id).await)
}

#[command]
pub async fn get_server_logs(
    app: AppHandle,
    instance_id: u64,
    offset: Option<u64>,
) -> Result<ServerLogsResponse, UiError> {
    let (_dir, instance) = find_instance(&app, instance_id)?;

    let data_dir = app.path().app_data_dir().map_err(|e| UiError {
        name: "path_error".into(),
        message: format!("Failed to resolve app data dir: {e}"),
    })?;
    let log_dir = data_dir.join("server-logs");
    let log_path = log_dir.join(format!("{}.log", instance.name));

    if !log_path.exists() {
        return Ok(ServerLogsResponse {
            lines: vec![],
            next_offset: 0,
            has_more: false,
        });
    }

    let content = read_to_string(&log_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read log file: {e}"),
    })?;

    let all_lines: Vec<&str> = content.lines().collect();

    const MAX_LINES: usize = 500;

    let has_offset = offset.is_some();
    let start_idx = if has_offset {
        (offset.unwrap_or(0) as usize).min(all_lines.len())
    } else {
        // No offset → tail: show last MAX_LINES
        all_lines.len().saturating_sub(MAX_LINES)
    };

    let end_idx = (start_idx + MAX_LINES).min(all_lines.len());
    let slice = &all_lines[start_idx..end_idx];

    let mut lines: Vec<ServerLogLine> = Vec::with_capacity(slice.len());
    for (i, &raw_line) in slice.iter().enumerate() {
        let offset = (start_idx + i) as u64;
        // Parse "[timestamp] message" format
        let (timestamp, message) = if let Some(rest) = raw_line.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                (rest[..end].to_string(), rest[end + 2..].to_string())
            } else {
                (String::new(), raw_line.to_string())
            }
        } else {
            (String::new(), raw_line.to_string())
        };
        lines.push(ServerLogLine {
            offset,
            timestamp,
            line: message,
        });
    }

    let next_offset = end_idx as u64;
    let has_more = end_idx < all_lines.len();

    Ok(ServerLogsResponse {
        lines,
        next_offset,
        has_more,
    })
}

// ────────── serverconfig.json ──────────

#[command]
pub async fn read_server_config(app: AppHandle, instance_id: u64) -> Result<String, UiError> {
    let (_dir, instance) = find_instance(&app, instance_id)?;
    let config_path = instance.data_dir.join("serverconfig.json");

    if config_path.exists() {
        read_to_string(&config_path).map_err(|e| UiError {
            name: "read_failed".into(),
            message: format!("Failed to read serverconfig.json: {e}"),
        })
    } else {
        // Return default template
        Ok(get_default_config_json())
    }
}

#[command]
pub async fn write_server_config(
    app: AppHandle,
    instance_id: u64,
    json_content: String,
) -> Result<(), UiError> {
    let (_dir, instance) = find_instance(&app, instance_id)?;

    // Validate JSON
    serde_json::from_str::<serde_json::Value>(&json_content).map_err(|e| UiError {
        name: "invalid_json".into(),
        message: format!("Invalid JSON: {e}"),
    })?;

    // Ensure data dir exists
    if !instance.data_dir.exists() {
        create_dir_all(&instance.data_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create data directory: {e}"),
        })?;
    }

    let config_path = instance.data_dir.join("serverconfig.json");
    write(&config_path, &json_content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write serverconfig.json: {e}"),
    })?;

    // If running, emit note about restart required
    if server_hosting_actor::is_running(instance_id) {
        let _ = app.emit(
            &format!("server-notice:{instance_id}"),
            serde_json::json!({
                "message": "serverconfig.json saved. Restart the server to apply changes.",
                "type": "restart_required"
            }),
        );
    }

    Ok(())
}

#[command]
pub async fn get_default_server_config(version: String) -> Result<String, UiError> {
    // Return a sensible default config template
    // In the future, this could be version-specific
    let _ = version;
    Ok(get_default_config_json())
}

fn get_default_config_json() -> String {
    get_default_config_json_with_port("Vintage Story Server", 42420)
}

fn get_default_config_json_with_port(server_name: &str, port: u16) -> String {
    serde_json::to_string_pretty(&serde_json::json!({
        "Port": port,
        "ServerName": server_name,
        "ServerDescription": "A Vintage Story server",
        "WelcomeMessage": "Welcome to the server!",
        "MaxClients": 16,
        "Password": "",
        "WhitelistMode": WhitelistMode::Off.as_u8(),
        "ServerUrl": "",
        "Upnp": false,
        "Advertise": false,
        "VerifyPlayerAuth": true,
        "AllowPvP": false,
        "AllowFireSpread": true,
        "DefaultSpawn": {
            "x": 0,
            "y": 0,
            "z": 0
        },
        "OnlyPlayerClasses": false,
        "MaxChunkRadius": 4,
        "BlockTickSamplesPerChunk": 32
    }))
    .unwrap_or_else(|_| "{}".to_string())
}

// ────────── Port checking ──────────

#[command]
pub async fn check_port_available(
    app: AppHandle,
    port: u16,
    bind_ip: String,
    exclude_instance_id: Option<u64>,
) -> Result<bool, UiError> {
    let instances = scan_instances(&app)?;

    let running_ids = server_hosting_actor::running_instance_ids();

    for inst in &instances {
        if let Some(exclude) = exclude_instance_id {
            if inst.id == exclude {
                continue;
            }
        }
        if running_ids.contains(&inst.id) && inst.port == port && inst.bind_ip == bind_ip {
            return Ok(false);
        }
    }

    Ok(true)
}

// ────────── Whitelist management ──────────

#[command]
pub async fn get_whitelist(
    app: AppHandle,
    instance_id: u64,
) -> Result<Vec<WhitelistEntry>, UiError> {
    let (_dir, instance) = find_instance(&app, instance_id)?;
    let whitelist_path = instance.data_dir.join("playerwhitelist.json");

    if !whitelist_path.exists() {
        return Ok(vec![]);
    }

    let content = read_to_string(&whitelist_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read playerwhitelist.json: {e}"),
    })?;

    let entries: Vec<WhitelistEntry> = serde_json::from_str(&content).unwrap_or_default();
    Ok(entries)
}

#[command]
pub async fn add_to_whitelist(
    app: AppHandle,
    instance_id: u64,
    uid: String,
    name: String,
) -> Result<WhitelistEntry, UiError> {
    log_info!("add_to_whitelist: id={instance_id} uid={uid} name={name}");

    let (_dir, instance) = find_instance(&app, instance_id)?;
    let whitelist_path = instance.data_dir.join("playerwhitelist.json");

    // Ensure data dir exists
    if !instance.data_dir.exists() {
        create_dir_all(&instance.data_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create data directory: {e}"),
        })?;
    }

    // Read existing
    let mut entries: Vec<WhitelistEntry> = if whitelist_path.exists() {
        let content = read_to_string(&whitelist_path).map_err(|e| UiError {
            name: "read_failed".into(),
            message: format!("Failed to read playerwhitelist.json: {e}"),
        })?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    // Check duplicate
    if entries.iter().any(|e| e.uid == uid) {
        return Err(UiError {
            name: "duplicate".into(),
            message: format!("Player UID {uid} is already in the whitelist."),
        });
    }

    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let entry = WhitelistEntry {
        uid: uid.clone(),
        name: name.clone(),
        added_at: Some(now),
        added_by: Some("manual".to_string()),
    };

    entries.push(entry.clone());

    // Write file
    let content = serde_json::to_string_pretty(&entries).map_err(|e| UiError {
        name: "serialize_failed".into(),
        message: format!("Failed to serialize playerwhitelist.json: {e}"),
    })?;
    write(&whitelist_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write playerwhitelist.json: {e}"),
    })?;

    // If running, also send /whitelist add command
    let is_running = server_hosting_actor::is_running(instance_id);
    if is_running {
        let _ = send_server_command_internal(instance_id, &format!("/whitelist add {uid}")).await;
    }

    log_info!("add_to_whitelist: added {uid} to instance {instance_id}");
    Ok(entry)
}

#[command]
pub async fn remove_from_whitelist(
    app: AppHandle,
    instance_id: u64,
    uid: String,
) -> Result<(), UiError> {
    log_info!("remove_from_whitelist: id={instance_id} uid={uid}");

    let (_dir, instance) = find_instance(&app, instance_id)?;
    let whitelist_path = instance.data_dir.join("playerwhitelist.json");

    if !whitelist_path.exists() {
        return Err(UiError {
            name: "not_found".into(),
            message: "playerwhitelist.json does not exist.".into(),
        });
    }

    let content = read_to_string(&whitelist_path).map_err(|e| UiError {
        name: "read_failed".into(),
        message: format!("Failed to read playerwhitelist.json: {e}"),
    })?;

    let mut entries: Vec<WhitelistEntry> = serde_json::from_str(&content).unwrap_or_default();

    let before = entries.len();
    entries.retain(|e| e.uid != uid);

    if entries.len() == before {
        return Err(UiError {
            name: "not_found".into(),
            message: format!("Player UID {uid} is not in the whitelist."),
        });
    }

    let content = serde_json::to_string_pretty(&entries).map_err(|e| UiError {
        name: "serialize_failed".into(),
        message: format!("Failed to serialize playerwhitelist.json: {e}"),
    })?;
    write(&whitelist_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write playerwhitelist.json: {e}"),
    })?;

    // If running, also send /whitelist remove command
    let is_running = server_hosting_actor::is_running(instance_id);
    if is_running {
        let _ =
            send_server_command_internal(instance_id, &format!("/whitelist remove {uid}")).await;
    }

    Ok(())
}

#[command]
pub async fn bulk_import_whitelist(
    app: AppHandle,
    instance_id: u64,
    entries: Vec<WhitelistEntry>,
) -> Result<usize, UiError> {
    log_info!(
        "bulk_import_whitelist: id={instance_id} count={}",
        entries.len()
    );

    let (_dir, instance) = find_instance(&app, instance_id)?;
    let whitelist_path = instance.data_dir.join("playerwhitelist.json");

    if !instance.data_dir.exists() {
        create_dir_all(&instance.data_dir).map_err(|e| UiError {
            name: "create_dir_failed".into(),
            message: format!("Failed to create data directory: {e}"),
        })?;
    }

    let content = serde_json::to_string_pretty(&entries).map_err(|e| UiError {
        name: "serialize_failed".into(),
        message: format!("Failed to serialize playerwhitelist.json: {e}"),
    })?;
    write(&whitelist_path, content).map_err(|e| UiError {
        name: "write_failed".into(),
        message: format!("Failed to write playerwhitelist.json: {e}"),
    })?;

    Ok(entries.len())
}

// ────────── Whitelist mode (serverconfig.json) ──────────

#[command]
pub async fn set_whitelist_mode(
    app: AppHandle,
    instance_id: u64,
    enabled: bool,
) -> Result<(), UiError> {
    log_info!("set_whitelist_mode: id={instance_id} enabled={enabled}");

    let (_dir, instance) = find_instance(&app, instance_id)?;
    let exe_path = server_exe_path(&app, &instance.version)?;
    let data_dir_str = instance.data_dir.to_string_lossy().to_string();

    let mode = if enabled {
        WhitelistMode::Whitelist
    } else {
        WhitelistMode::Off
    };
    let setconfig_arg = format!("--setconfig={{ WhitelistMode: {} }}", mode.as_u8());

    log_info!(
        "set_whitelist_mode: exe={:?} dataPath={data_dir_str} arg={setconfig_arg}",
        exe_path
    );

    let output = Command::new(exe_path.to_string_lossy().as_ref())
        .arg("--dataPath")
        .arg(&data_dir_str)
        .arg(&setconfig_arg)
        .output()
        .await
        .map_err(|e| UiError {
            name: "setconfig_failed".into(),
            message: format!("Failed to run --setconfig: {e}"),
        })?;

    let exit_code = output.status.code().unwrap_or(-1);
    if exit_code != 0 && exit_code != 200 {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        log_error!("set_whitelist_mode: --setconfig failed (exit {exit_code}): stdout={stdout} stderr={stderr}");
        return Err(UiError {
            name: "setconfig_failed".into(),
            message: format!("--setconfig failed (exit {exit_code})\n{stdout}\n{stderr}"),
        });
    }

    log_info!("set_whitelist_mode: done (exit {exit_code})");
    Ok(())
}

// ────────── Player UID/name lookup ──────────

#[command]
pub async fn lookup_player_uid(
    client: State<'_, Arc<reqwest::Client>>,
    account_name: String,
) -> Result<Option<WhitelistEntry>, UiError> {
    log_info!("lookup_player_uid: name={account_name}");
    let res = client
        .post("https://auth3.vintagestory.at/resolveplayername")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("playername={account_name}"))
        .send()
        .await
        .map_err(|e| UiError {
            name: "request_failed".into(),
            message: format!("Failed to resolve player name: {e}"),
        })?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json: serde_json::Value = res.json().await.map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse response: {e}"),
    })?;

    let playeruid = json.get("playeruid").and_then(|v| v.as_str());

    match playeruid {
        Some(uid) if uid != "null" => {
            log_info!("lookup_player_uid: {account_name} → {uid}");
            Ok(Some(WhitelistEntry {
                uid: uid.to_string(),
                name: account_name,
                added_at: None,
                added_by: None,
            }))
        }
        _ => {
            log_info!("lookup_player_uid: {account_name} not found");
            Ok(None)
        }
    }
}

#[command]
pub async fn lookup_player_name(
    client: State<'_, Arc<reqwest::Client>>,
    uid: String,
) -> Result<Option<String>, UiError> {
    log_info!("lookup_player_name: uid={uid}");
    let res = client
        .post("https://auth3.vintagestory.at/resolveplayeruid")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("uid={uid}"))
        .send()
        .await
        .map_err(|e| UiError {
            name: "request_failed".into(),
            message: format!("Failed to resolve player UID: {e}"),
        })?;

    if !res.status().is_success() {
        return Err(UiError {
            name: "http_error".into(),
            message: format!("HTTP error: {}", res.status()),
        });
    }

    let json: serde_json::Value = res.json().await.map_err(|e| UiError {
        name: "parse_failed".into(),
        message: format!("Failed to parse response: {e}"),
    })?;

    let playername = json.get("playername").and_then(|v| v.as_str());

    match playername {
        Some(name) if name != "null" => {
            log_info!("lookup_player_name: {uid} → {name}");
            Ok(Some(name.to_string()))
        }
        _ => {
            log_info!("lookup_player_name: {uid} not found");
            Ok(None)
        }
    }
}

/// Force-kill all running server processes. Called on app shutdown.
pub fn kill_all_running_servers() {
    tauri::async_runtime::block_on(async {
        server_hosting_actor::kill_all().await;
    });
}

#[command]
pub async fn get_server_data_dir_size(
    app: AppHandle,
    instance_id: u64,
) -> Result<DirSizeInfo, UiError> {
    let (_dir, instance) = find_instance(&app, instance_id)?;
    let data_path = &instance.data_dir;
    let size_bytes = dir_size(data_path);
    let size_display = format_size(size_bytes);
    log_info!("get_server_data_dir_size: id={instance_id} size={size_display}");
    Ok(DirSizeInfo {
        size_bytes,
        size_display,
    })
}
