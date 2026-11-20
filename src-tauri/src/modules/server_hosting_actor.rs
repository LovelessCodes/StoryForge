//! Per-hosted-server process actor.
//!
//! Each running server is represented by a tokio task that owns its `Child`
//! handle, stdin/stdout/stderr pipes, and runtime status. Other code interacts
//! with the server by sending commands through an async channel.
//!
//! This replaces the previous global `Mutex<HashMap<...>>` process state and
//! removes the need for `unsafe { libc::kill(...) }`.

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader},
    process::{Child, Command},
    sync::{mpsc, oneshot},
};

use chrono::Local;

use super::server_hosting::{
    append_log, emit_log, emit_status, open_instance_log, server_exe_path, HostedServerInstance,
    InstanceLog, ServerStatus, ServerStatusInfo,
};
use super::utils::lock;
use crate::{log_error, log_info};

/// Commands that can be sent to a running server actor.
#[derive(Debug)]
pub enum ServerCommand {
    /// Request a snapshot of the current status.
    GetStatus(oneshot::Sender<ServerStatusInfo>),
    /// Send a command to the server's stdin.
    SendCommand(String),
    /// Gracefully stop the server.
    Stop,
}

/// Handle used by callers to communicate with a server actor.
#[derive(Clone, Debug)]
pub struct ServerActorHandle {
    tx: mpsc::UnboundedSender<ServerCommand>,
}

impl ServerActorHandle {
    pub fn send(&self, cmd: ServerCommand) -> Result<(), ServerCommand> {
        self.tx.send(cmd).map_err(|e| e.0)
    }

    pub async fn status(&self) -> ServerStatusInfo {
        let (tx, rx) = oneshot::channel();
        let _ = self.send(ServerCommand::GetStatus(tx));
        rx.await.unwrap_or_else(|_| ServerStatusInfo {
            status: "stopped".to_string(),
            pid: None,
            uptime: None,
            exit_code: None,
        })
    }
}

/// One registered actor: its handle plus the token of the generation that
/// registered it, so a stale teardown cannot remove a newer actor's entry.
#[derive(Clone, Debug)]
struct ActorEntry {
    token: u64,
    handle: ServerActorHandle,
}

/// Global map of running server actors, keyed by instance ID.
static ACTORS: LazyLock<Mutex<HashMap<u64, ActorEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Instance IDs whose `start_hosted_server` setup is still in flight, i.e. a
/// start was reserved but no actor has been registered yet.
static STARTING: LazyLock<Mutex<HashSet<u64>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// PID of the process the actor is currently supervising, per instance.
///
/// Shutdown needs this to kill a server whose actor is busy inside its stop
/// sequence and therefore no longer reading commands from the channel.
static CHILD_PIDS: LazyLock<Mutex<HashMap<u64, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Source of actor generation tokens; tokens are never reused.
static NEXT_ACTOR_TOKEN: AtomicU64 = AtomicU64::new(1);

/// Returns true if an actor is registered for the given instance.
pub fn is_running(instance_id: u64) -> bool {
    lock(&ACTORS).contains_key(&instance_id)
}

/// Returns the IDs of all registered actors.
pub fn running_instance_ids() -> Vec<u64> {
    lock(&ACTORS).keys().copied().collect()
}

/// Reserve an instance for a start whose actor does not exist yet.
///
/// Starting a server awaits runtime setup (`ensure_dotnet`), so without this
/// reservation two concurrent starts would both pass the "not running" check
/// and the second `spawn` would overwrite the first actor's handle, orphaning
/// a live process. Returns `None` when the instance is running or already
/// being started; the returned guard releases the reservation on drop, so
/// every error path leaves the instance startable again.
pub fn try_reserve(instance_id: u64) -> Option<StartReservation> {
    let mut starting = lock(&STARTING);
    if starting.contains(&instance_id) || is_running(instance_id) {
        return None;
    }
    starting.insert(instance_id);
    Some(StartReservation { instance_id })
}

/// RAII guard for a start reservation; see [`try_reserve`].
#[derive(Debug)]
pub struct StartReservation {
    instance_id: u64,
}

impl Drop for StartReservation {
    fn drop(&mut self) {
        release(self.instance_id);
    }
}

/// Releases a start reservation without touching a registered actor.
fn release(instance_id: u64) {
    lock(&STARTING).remove(&instance_id);
}

/// Register a new actor handle under a fresh generation token.
pub fn register(instance_id: u64, token: u64, handle: ServerActorHandle) {
    lock(&ACTORS).insert(instance_id, ActorEntry { token, handle });
}

/// Unregister an actor handle. Does not stop the process.
///
/// The entry is only removed while it still belongs to `token`, so the
/// teardown of an old actor cannot drop a newer actor's handle.
pub fn unregister(instance_id: u64, token: u64) {
    let mut actors = lock(&ACTORS);
    if actors.get(&instance_id).map(|entry| entry.token) == Some(token) {
        actors.remove(&instance_id);
    }
}

/// Get a clone of an actor handle if one exists.
pub fn get_handle(instance_id: u64) -> Option<ServerActorHandle> {
    lock(&ACTORS)
        .get(&instance_id)
        .map(|entry| entry.handle.clone())
}

/// Spawn a new server process and actor task for the given instance.
pub async fn spawn(
    app: tauri::AppHandle,
    instance: HostedServerInstance,
    dotnet_root: PathBuf,
) -> Result<(), super::errors::UiError> {
    let instance_id = instance.id;

    let process = launch_process(&app, &instance, &dotnet_root)?;

    let (tx, rx) = mpsc::unbounded_channel();
    let handle = ServerActorHandle { tx };
    let token = NEXT_ACTOR_TOKEN.fetch_add(1, Ordering::Relaxed);
    register(instance_id, token, handle.clone());
    // Publish the starting state (and PID) as soon as the process exists, so a
    // client that missed the optimistic update still sees it is starting.
    emit_status(
        &app,
        instance_id,
        &ServerStatus::Starting,
        process.pid,
        Some(Instant::now()),
    );

    let app_clone = app.clone();
    tokio::spawn(async move {
        run_actor(app_clone, instance, process, rx, dotnet_root, token).await;
    });

    log_info!("start_hosted_server: spawned instance {instance_id}");
    Ok(())
}

/// Builds the server command line. The server binary is a .NET apphost, so it
/// needs the same DOTNET_ROOT resolution as the game client.
fn build_command(
    app: &tauri::AppHandle,
    instance: &HostedServerInstance,
    dotnet_root: &Path,
) -> Result<Command, super::errors::UiError> {
    let exe_path = server_exe_path(app, &instance.version)?;
    let data_dir_str = instance.data_dir.to_string_lossy().to_string();
    let mut cmd = Command::new(exe_path.to_string_lossy().as_ref());
    cmd.env("DOTNET_ROOT", dotnet_root)
        .env("DOTNET_ROLL_FORWARD", "LatestMinor")
        .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
        .arg("--dataPath")
        .arg(&data_dir_str);

    // Add extra start params (shell-like quoting)
    cmd.args(super::utils::parse_start_params(&instance.start_params)?);

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped())
        .kill_on_drop(true);

    // On Unix, run the server in its own process group so we can terminate
    // any spawned children together with the main process.
    #[cfg(unix)]
    cmd.process_group(0);

    Ok(cmd)
}

/// Spawns one server process with piped stdio.
fn launch_process(
    app: &tauri::AppHandle,
    instance: &HostedServerInstance,
    dotnet_root: &Path,
) -> Result<ServerProcess, super::errors::UiError> {
    let mut cmd = build_command(app, instance, dotnet_root)?;
    let mut child = cmd.spawn().map_err(|e| {
        log_error!("start_hosted_server: spawn failed: {e}");
        super::errors::UiError {
            name: "spawn_failed".into(),
            message: format!("Failed to start server process: {e}"),
        }
    })?;

    let pid = child.id();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| super::errors::UiError::from("stdout not piped"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| super::errors::UiError::from("stderr not piped"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| super::errors::UiError::from("stdin not piped"))?;

    Ok(ServerProcess {
        child,
        pid,
        stdout,
        stderr,
        stdin,
    })
}

/// Owned handles for a spawned server process.
struct ServerProcess {
    child: Child,
    pid: Option<u32>,
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
    stdin: tokio::process::ChildStdin,
}

/// The banner Vintage Story prints once it accepts connections.
const READY_MARKER: &str = "dedicated server now running on port";

/// True when a line is the server's "ready" banner.
///
/// The comparison is case-insensitive because the banner's casing has varied
/// between game versions. Missing it leaves the instance on "starting" even
/// though the server is up.
fn is_ready_line(line: &str) -> bool {
    line.to_ascii_lowercase().contains(READY_MARKER)
}

/// Reads one line of process output, lossily decoding invalid UTF-8.
///
/// `AsyncBufReadExt::lines` returns an error for a line that is not valid
/// UTF-8, and stopping the reader there would silence the console for the rest
/// of the session. It is also worse than that on Windows: once nobody drains
/// the pipe, the server blocks on its next write. A mod printing a single
/// non-UTF-8 byte must not be able to do that.
async fn read_output_line<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    buffer: &mut Vec<u8>,
) -> std::io::Result<Option<String>> {
    buffer.clear();
    if reader.read_until(b'\n', buffer).await? == 0 {
        return Ok(None);
    }
    if buffer.last() == Some(&b'\n') {
        buffer.pop();
    }
    if buffer.last() == Some(&b'\r') {
        buffer.pop();
    }
    Ok(Some(String::from_utf8_lossy(buffer).into_owned()))
}

/// Forwards one of a server's output streams to the console, log file and
/// status until the stream closes.
#[allow(clippy::too_many_arguments)]
fn spawn_output_reader<R>(
    app: tauri::AppHandle,
    instance_id: u64,
    reader: R,
    log_writer: Arc<Mutex<Option<InstanceLog>>>,
    status: Arc<tokio::sync::Mutex<ServerStatus>>,
    startup_reported: Arc<std::sync::atomic::AtomicBool>,
    last_output: Arc<Mutex<Instant>>,
    pid: Option<u32>,
    started_at: Instant,
) where
    R: AsyncBufRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut reader = reader;
        let mut buffer = Vec::new();
        loop {
            match read_output_line(&mut reader, &mut buffer).await {
                Ok(Some(line)) => {
                    *lock(&last_output) = Instant::now();
                    emit_log(&app, instance_id, &line);
                    append_log(&log_writer, &line);

                    if is_ready_line(&line) && !startup_reported.swap(true, Ordering::SeqCst) {
                        *status.lock().await = ServerStatus::Running;
                        emit_status(
                            &app,
                            instance_id,
                            &ServerStatus::Running,
                            pid,
                            Some(started_at),
                        );
                    }
                }
                Ok(None) => break,
                Err(error) => {
                    log_error!(
                        "server_hosting: instance {instance_id} output reader stopped: {error}"
                    );
                    break;
                }
            }
        }
    });
}

/// One session's ending: who decided it.
enum SessionExit {
    /// Someone asked for a stop, or the process ended cleanly; never restart.
    StoppedByUser,
    /// The daily schedule asked for a restart.
    ScheduledRestart,
    /// The process exited on its own with a non-zero code.
    Unexpected(Option<i32>),
}

struct SessionResult {
    exit: SessionExit,
    status: ServerStatus,
    ran_secs: u64,
}

/// How many unexpected exits in a row trigger a restart before giving up.
const MAX_AUTO_RESTARTS: u32 = 5;
/// The daily schedule is checked on this cadence; minute precision is enough.
const SCHEDULE_TICK: Duration = Duration::from_secs(30);
/// A session this long resets the auto-restart budget.
const AUTO_RESTART_RESET_SECS: u64 = 120;

/// True when the local clock reached the schedule and today is not marked yet.
fn schedule_due(schedule: &str, last_day: &mut Option<String>) -> bool {
    let now = Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    if last_day.as_deref() == Some(today.as_str()) {
        return false;
    }
    if now.format("%H:%M").to_string() == schedule {
        *last_day = Some(today);
        return true;
    }
    false
}

/// Supervisor: runs one server process at a time, relaunching it for
/// auto-restarts and the daily schedule until someone stops it for good.
async fn run_actor(
    app: tauri::AppHandle,
    instance: HostedServerInstance,
    first_process: ServerProcess,
    mut cmd_rx: mpsc::UnboundedReceiver<ServerCommand>,
    dotnet_root: PathBuf,
    token: u64,
) {
    let instance_id = instance.id;
    let mut process = Some(first_process);
    let mut unexpected_exits: u32 = 0;
    let mut last_scheduled_day: Option<String> = None;

    let final_status = loop {
        let current = match process.take() {
            Some(process) => process,
            None => match launch_process(&app, &instance, &dotnet_root) {
                Ok(process) => process,
                Err(error) => {
                    log_error!(
                        "server_hosting: instance {instance_id} failed to relaunch: {}",
                        error.message
                    );
                    break ServerStatus::Crashed { exit_code: None };
                }
            },
        };

        let result = run_session(
            &app,
            &instance,
            current,
            &mut cmd_rx,
            &mut last_scheduled_day,
        )
        .await;

        match result.exit {
            SessionExit::StoppedByUser => break result.status,
            SessionExit::ScheduledRestart => {
                log_info!("server_hosting: instance {instance_id} restarting on schedule");
                unexpected_exits = 0;
                tokio::time::sleep(Duration::from_secs(2)).await;
                emit_status(
                    &app,
                    instance_id,
                    &ServerStatus::Starting,
                    None,
                    Some(Instant::now()),
                );
            }
            SessionExit::Unexpected(exit_code) => {
                if !instance.auto_restart {
                    break result.status;
                }
                if result.ran_secs >= AUTO_RESTART_RESET_SECS {
                    unexpected_exits = 0;
                }
                unexpected_exits += 1;
                if unexpected_exits > MAX_AUTO_RESTARTS {
                    log_error!(
                        "server_hosting: instance {instance_id} auto-restart limit reached after {} attempts",
                        unexpected_exits - 1
                    );
                    break result.status;
                }
                let delay = (5u64 << (unexpected_exits - 1).min(3)).min(60);
                log_info!(
                    "server_hosting: instance {instance_id} exited unexpectedly ({exit_code:?}), restart {unexpected_exits}/{MAX_AUTO_RESTARTS} in {delay}s"
                );
                tokio::time::sleep(Duration::from_secs(delay)).await;
                emit_status(
                    &app,
                    instance_id,
                    &ServerStatus::Starting,
                    None,
                    Some(Instant::now()),
                );
            }
        }
    };

    unregister(instance_id, token);
    emit_status(&app, instance_id, &final_status, None, None);
    log_info!(
        "server_hosting: instance {instance_id} exited ({})",
        final_status.as_str()
    );
}

/// Runs one server process until it exits, is stopped, or the schedule fires.
async fn run_session(
    app: &tauri::AppHandle,
    instance: &HostedServerInstance,
    process: ServerProcess,
    cmd_rx: &mut mpsc::UnboundedReceiver<ServerCommand>,
    last_scheduled_day: &mut Option<String>,
) -> SessionResult {
    let ServerProcess {
        mut child,
        pid,
        stdout,
        stderr,
        stdin,
    } = process;
    let instance_id = instance.id;
    let started_at = Instant::now();
    if let Some(pid) = pid {
        lock(&CHILD_PIDS).insert(instance_id, pid);
    }
    let log_writer = Arc::new(std::sync::Mutex::new(open_instance_log(app, instance_id)));
    let stdin = Arc::new(tokio::sync::Mutex::new(stdin));
    let status = Arc::new(tokio::sync::Mutex::new(ServerStatus::Starting));
    let startup_reported = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let last_output = Arc::new(Mutex::new(Instant::now()));

    spawn_output_reader(
        app.clone(),
        instance_id,
        AsyncBufReader::new(stdout),
        log_writer.clone(),
        status.clone(),
        startup_reported.clone(),
        last_output.clone(),
        pid,
        started_at,
    );
    spawn_output_reader(
        app.clone(),
        instance_id,
        AsyncBufReader::new(stderr),
        log_writer.clone(),
        status.clone(),
        startup_reported.clone(),
        last_output.clone(),
        pid,
        started_at,
    );

    let mut schedule_tick = tokio::time::interval(SCHEDULE_TICK);
    schedule_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut startup_tick = tokio::time::interval(Duration::from_secs(60));

    let (exit, final_status) = loop {
        tokio::select! {
            biased;

            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(ServerCommand::GetStatus(reply)) => {
                        let status_guard = status.lock().await;
                        let current = status_guard.clone();
                        drop(status_guard);
                        let uptime = if current == ServerStatus::Running || current == ServerStatus::Starting {
                            Some(started_at.elapsed().as_secs())
                        } else {
                            None
                        };
                        let exit_code = match current {
                            ServerStatus::Crashed { exit_code } => exit_code,
                            _ => None,
                        };
                        let _ = reply.send(ServerStatusInfo {
                            status: current.as_str().to_string(),
                            pid,
                            uptime,
                            exit_code,
                        });
                    }
                    Some(ServerCommand::SendCommand(command)) => {
                        let mut guard = stdin.lock().await;
                        let _ = guard.write_all(format!("{}\n", command).as_bytes()).await;
                        let _ = guard.flush().await;
                    }
                    Some(ServerCommand::Stop) => {
                        let new_status = graceful_stop(
                            &mut child,
                            pid,
                            &status,
                            &stdin,
                            app,
                            instance_id,
                            started_at,
                        )
                        .await;
                        break (SessionExit::StoppedByUser, new_status);
                    }
                    None => {
                        // All handles dropped; exit actor without restarting.
                        let current = status.lock().await.clone();
                        break (SessionExit::StoppedByUser, current);
                    }
                }
            }

            _ = schedule_tick.tick() => {
                let Some(schedule) = instance.restart_schedule.as_deref() else {
                    continue;
                };
                let is_running = *status.lock().await == ServerStatus::Running;
                if !is_running || !schedule_due(schedule, last_scheduled_day) {
                    continue;
                }
                log_info!(
                    "server_hosting: instance {instance_id} scheduled restart at {schedule}"
                );
                let new_status = graceful_stop(
                    &mut child,
                    pid,
                    &status,
                    &stdin,
                    app,
                    instance_id,
                    started_at,
                )
                .await;
                break (SessionExit::ScheduledRestart, new_status);
            }

            _ = startup_tick.tick() => {
                let is_starting = *status.lock().await == ServerStatus::Starting;
                if is_starting {
                    let idle = lock(&last_output).elapsed();
                    if idle >= Duration::from_secs(60) {
                        // A silent startup is normal while a big modded world
                        // loads, so this is a hint for support reports rather
                        // than a timeout that would kill a healthy server.
                        log_info!(
                            "server_hosting: instance {instance_id} still starting after {}s, no output for {}s",
                            started_at.elapsed().as_secs(),
                            idle.as_secs()
                        );
                    }
                }
            }

            wait_result = child.wait() => {
                let exit_code = wait_result.ok().and_then(|s| s.code());
                let (exit, new_status) = match exit_code {
                    // A clean exit is someone stopping the server, not a crash.
                    Some(0) => (SessionExit::StoppedByUser, ServerStatus::Stopped),
                    _ => (
                        SessionExit::Unexpected(exit_code),
                        ServerStatus::Crashed { exit_code },
                    ),
                };
                *status.lock().await = new_status.clone();
                break (exit, new_status);
            }
        }
    };

    lock(&CHILD_PIDS).remove(&instance_id);

    SessionResult {
        exit,
        ran_secs: started_at.elapsed().as_secs(),
        status: final_status,
    }
}

/// Graceful stop sequence: `/stop`, then SIGTERM/taskkill, then force kill.
async fn graceful_stop(
    child: &mut Child,
    pid: Option<u32>,
    status: &Arc<tokio::sync::Mutex<ServerStatus>>,
    stdin: &Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    app: &tauri::AppHandle,
    instance_id: u64,
    started_at: Instant,
) -> ServerStatus {
    {
        *status.lock().await = ServerStatus::Stopping;
    }
    emit_status(
        app,
        instance_id,
        &ServerStatus::Stopping,
        pid,
        Some(started_at),
    );

    // Step 1: ask the server to stop gracefully.
    {
        let mut guard = stdin.lock().await;
        let _ = guard.write_all(b"/stop\n").await;
        let _ = guard.flush().await;
    }

    // Step 2: wait up to 10s for clean exit.
    let timeout = tokio::time::timeout(Duration::from_secs(10), child.wait()).await;
    match timeout {
        Ok(Ok(exit)) => {
            if exit.success() {
                ServerStatus::Stopped
            } else {
                ServerStatus::Crashed {
                    exit_code: exit.code(),
                }
            }
        }
        _ => {
            // Step 3: escalate to SIGTERM / graceful kill.
            log_info!("server_hosting: instance {instance_id} did not stop cleanly, escalating");
            if let Some(p) = pid {
                #[cfg(unix)]
                super::utils::signal_process_group(p, nix::sys::signal::Signal::SIGTERM);
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new(super::utils::taskkill_executable())
                        .args(["/PID", &p.to_string(), "/T"])
                        .output();
                }
            }

            // Step 4: wait up to 5s more.
            let timeout2 = tokio::time::timeout(Duration::from_secs(5), child.wait()).await;
            match timeout2 {
                Ok(Ok(exit)) => {
                    if exit.success() {
                        ServerStatus::Stopped
                    } else {
                        ServerStatus::Crashed {
                            exit_code: exit.code(),
                        }
                    }
                }
                _ => {
                    // Step 5: force kill.
                    let _ = child.kill().await;
                    ServerStatus::Crashed { exit_code: None }
                }
            }
        }
    }
}

/// Request a graceful stop of a running server instance.
pub async fn stop(instance_id: u64) -> Result<(), super::errors::UiError> {
    match get_handle(instance_id) {
        Some(handle) => {
            handle
                .send(ServerCommand::Stop)
                .map_err(|_| super::errors::UiError::from("failed to send stop command"))?;
            Ok(())
        }
        None => Err(super::errors::UiError {
            name: "not_running".into(),
            message: "Instance is not running.".into(),
        }),
    }
}

/// Request a graceful stop and wait until the actor has exited.
///
/// Used by restart, which must not start a second process while the old one
/// is still shutting down and holding the port.
pub async fn stop_and_wait(
    instance_id: u64,
    timeout: Duration,
) -> Result<(), super::errors::UiError> {
    let handle = match get_handle(instance_id) {
        Some(handle) => handle,
        None => {
            return Err(super::errors::UiError {
                name: "not_running".into(),
                message: "Instance is not running.".into(),
            })
        }
    };
    handle
        .send(ServerCommand::Stop)
        .map_err(|_| super::errors::UiError::from("failed to send stop command"))?;

    let deadline = Instant::now() + timeout;
    while is_running(instance_id) {
        if Instant::now() >= deadline {
            return Err(super::errors::UiError {
                name: "timeout".into(),
                message: format!(
                    "Instance {instance_id} did not stop within {}s",
                    timeout.as_secs()
                ),
            });
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Ok(())
}

/// Send a command to a running server instance's stdin.
pub async fn send_command(instance_id: u64, command: String) -> Result<(), super::errors::UiError> {
    match get_handle(instance_id) {
        Some(handle) => {
            handle
                .send(ServerCommand::SendCommand(command))
                .map_err(|_| super::errors::UiError::from("failed to send command"))?;
            Ok(())
        }
        None => Err(super::errors::UiError {
            name: "not_running".into(),
            message: "Instance is not running (no stdin pipe available).".into(),
        }),
    }
}

/// Get the current status of a server instance.
pub async fn status(instance_id: u64) -> ServerStatusInfo {
    match get_handle(instance_id) {
        Some(handle) => handle.status().await,
        None => ServerStatusInfo {
            status: "stopped".to_string(),
            pid: None,
            uptime: None,
            exit_code: None,
        },
    }
}

/// How long one instance gets to stop gracefully during shutdown.
const SHUTDOWN_STOP_TIMEOUT: Duration = Duration::from_secs(5);
/// How long a force-killed instance gets to unregister its actor.
const SHUTDOWN_KILL_WAIT: Duration = Duration::from_secs(1);

/// Kill an instance's process without going through its actor.
///
/// A channel command cannot be used here: after a `Stop` the actor is inside
/// the graceful stop sequence for up to 15s and does not read further commands,
/// while app shutdown tears the runtime down as soon as `kill_all` returns.
/// Returns false when no live process is known for the instance.
pub fn force_kill(instance_id: u64) -> bool {
    let pid = match lock(&CHILD_PIDS).get(&instance_id).copied() {
        Some(pid) => pid,
        None => return false,
    };

    #[cfg(unix)]
    super::utils::signal_process_group(pid, nix::sys::signal::Signal::SIGKILL);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new(super::utils::taskkill_executable())
            .args(["/PID", &pid.to_string(), "/F", "/T"])
            .output();
    }

    log_info!("server_hosting: instance {instance_id} force-killed (pid {pid})");
    true
}

/// Force-kill all running server processes. Called on app shutdown.
///
/// A plain `stop()` only enqueues `ServerCommand::Stop` and returns, so the
/// runtime would be torn down before the actors ran their stop sequence and
/// the servers would survive as orphans. Each instance therefore gets a
/// bounded window to stop gracefully and is killed outright when it misses it.
pub async fn kill_all() {
    log_info!("server_hosting: killing all running servers on shutdown");
    let ids = running_instance_ids();
    if ids.is_empty() {
        return;
    }
    for id in &ids {
        log_info!("server_hosting: requesting stop for instance {id}");
    }
    futures_util::future::join_all(ids.iter().copied().map(stop_for_shutdown)).await;
    log_info!(
        "server_hosting: shutdown finished, {} server(s) still registered",
        running_instance_ids().len()
    );
}

/// One instance's shutdown: graceful stop with a deadline, then force kill.
async fn stop_for_shutdown(instance_id: u64) {
    match stop_and_wait(instance_id, SHUTDOWN_STOP_TIMEOUT).await {
        Ok(()) => return,
        Err(e) if e.name == "not_running" => return,
        Err(e) => log_info!(
            "server_hosting: instance {instance_id} did not stop in time ({}), killing it",
            e.message
        ),
    }

    if !force_kill(instance_id) {
        return;
    }

    // Give the actor a moment to reap the process and unregister before the
    // runtime goes away.
    let deadline = Instant::now() + SHUTDOWN_KILL_WAIT;
    while is_running(instance_id) && Instant::now() < deadline {
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_line_matches_any_casing() {
        assert!(is_ready_line(
            "[Server Notification] Dedicated Server now running on Port 42420"
        ));
        assert!(is_ready_line("dedicated server now running on port 42420"));
        assert!(!is_ready_line("Dedicated Server starting up"));
    }

    #[tokio::test]
    async fn output_reader_survives_invalid_utf8() {
        // A mod printing a non-UTF-8 byte must not end the stream.
        let input = b"before\nbad \xFF byte\nafter\n";
        let mut reader = AsyncBufReader::new(&input[..]);
        let mut buffer = Vec::new();

        assert_eq!(
            read_output_line(&mut reader, &mut buffer)
                .await
                .unwrap()
                .as_deref(),
            Some("before")
        );
        let bad = read_output_line(&mut reader, &mut buffer)
            .await
            .unwrap()
            .unwrap();
        assert!(bad.starts_with("bad "));
        assert!(bad.ends_with(" byte"));
        assert_eq!(
            read_output_line(&mut reader, &mut buffer)
                .await
                .unwrap()
                .as_deref(),
            Some("after")
        );
        assert_eq!(
            read_output_line(&mut reader, &mut buffer).await.unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn output_reader_strips_crlf() {
        let input = b"one\r\ntwo";
        let mut reader = AsyncBufReader::new(&input[..]);
        let mut buffer = Vec::new();

        assert_eq!(
            read_output_line(&mut reader, &mut buffer)
                .await
                .unwrap()
                .as_deref(),
            Some("one")
        );
        assert_eq!(
            read_output_line(&mut reader, &mut buffer)
                .await
                .unwrap()
                .as_deref(),
            Some("two")
        );
    }
}
