//! Per-hosted-server process actor.
//!
//! Each running server is represented by a tokio task that owns its `Child`
//! handle, stdin/stdout/stderr pipes, and runtime status. Other code interacts
//! with the server by sending commands through an async channel.
//!
//! This replaces the previous global `Mutex<HashMap<...>>` process state and
//! removes the need for `unsafe { libc::kill(...) }`.

use std::{
    process::Stdio,
    sync::{Arc, LazyLock, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader as AsyncBufReader},
    process::{Child, Command},
    sync::{mpsc, oneshot},
};

use super::server_hosting::{
    append_log, emit_log, emit_status, server_exe_path, HostedServerInstance, ServerStatus,
    ServerStatusInfo,
};
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

/// Global map of running server actors, keyed by instance ID.
static ACTORS: LazyLock<Mutex<std::collections::HashMap<u64, ServerActorHandle>>> =
    LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

/// Returns true if an actor is registered for the given instance.
pub fn is_running(instance_id: u64) -> bool {
    ACTORS
        .lock()
        .map(|actors| actors.contains_key(&instance_id))
        .unwrap_or(false)
}

/// Returns the IDs of all registered actors.
pub fn running_instance_ids() -> Vec<u64> {
    ACTORS
        .lock()
        .map(|actors| actors.keys().copied().collect())
        .unwrap_or_default()
}

/// Register a new actor handle.
pub fn register(instance_id: u64, handle: ServerActorHandle) {
    if let Ok(mut actors) = ACTORS.lock() {
        actors.insert(instance_id, handle);
    }
}

/// Unregister an actor handle. Does not stop the process.
pub fn unregister(instance_id: u64) {
    if let Ok(mut actors) = ACTORS.lock() {
        actors.remove(&instance_id);
    }
}

/// Get a clone of an actor handle if one exists.
pub fn get_handle(instance_id: u64) -> Option<ServerActorHandle> {
    ACTORS.lock().ok()?.get(&instance_id).cloned()
}

/// Spawn a new server process and actor task for the given instance.
pub async fn spawn(
    app: tauri::AppHandle,
    instance: HostedServerInstance,
) -> Result<(), super::errors::UiError> {
    let instance_id = instance.id;

    // Resolve server exe path
    let exe_path = server_exe_path(&app, &instance.version)?;

    // Build command
    let data_dir_str = instance.data_dir.to_string_lossy().to_string();
    let mut cmd = Command::new(exe_path.to_string_lossy().as_ref());
    cmd.arg("--dataPath").arg(&data_dir_str);

    // Add extra start params
    if !instance.start_params.is_empty() {
        for param in instance.start_params.split_whitespace() {
            cmd.arg(param);
        }
    }

    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped())
        .kill_on_drop(true);

    // On Unix, run the server in its own process group so we can terminate
    // any spawned children together with the main process.
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }

    emit_status(
        &app,
        instance_id,
        &ServerStatus::Starting,
        None,
        Some(Instant::now()),
    );

    let mut child = cmd.spawn().map_err(|e| {
        log_error!("start_hosted_server: spawn failed: {e}");
        super::errors::UiError {
            name: "spawn_failed".into(),
            message: format!("Failed to start server process: {e}"),
        }
    })?;

    let pid = child.id();

    // Take the pipes before moving child into the actor task.
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

    let (tx, rx) = mpsc::unbounded_channel();
    let handle = ServerActorHandle { tx };
    register(instance_id, handle.clone());

    let app_clone = app.clone();
    tokio::spawn(async move {
        run_actor(app_clone, instance, pid, child, stdout, stderr, stdin, rx).await;
    });

    log_info!("start_hosted_server: spawned instance {instance_id}");
    Ok(())
}

/// Main actor loop. Owns the `Child` handle and all I/O streams.
async fn run_actor(
    app: tauri::AppHandle,
    instance: HostedServerInstance,
    pid: Option<u32>,
    mut child: Child,
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
    stdin: tokio::process::ChildStdin,
    mut cmd_rx: mpsc::UnboundedReceiver<ServerCommand>,
) {
    let instance_id = instance.id;
    let instance_name = instance.name.clone();
    let started_at = Instant::now();
    let stdin = Arc::new(tokio::sync::Mutex::new(stdin));
    let status = Arc::new(tokio::sync::Mutex::new(ServerStatus::Starting));
    let startup_reported = Arc::new(std::sync::atomic::AtomicBool::new(false));

    // stdout reader
    let app_stdout = app.clone();
    let name_stdout = instance_name.clone();
    let status_stdout = status.clone();
    let startup_reported_stdout = startup_reported.clone();
    tokio::spawn(async move {
        let reader = AsyncBufReader::new(stdout);
        let mut lines = reader.lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    emit_log(&app_stdout, instance_id, &line);
                    append_log(&app_stdout, &name_stdout, &line);

                    // Also detect startup line here — VS may print it to stdout
                    if line.contains("Dedicated Server now running on Port")
                        && !startup_reported_stdout.load(std::sync::atomic::Ordering::SeqCst)
                    {
                        startup_reported_stdout.store(true, std::sync::atomic::Ordering::SeqCst);
                        *status_stdout.lock().await = ServerStatus::Running;
                        emit_status(
                            &app_stdout,
                            instance_id,
                            &ServerStatus::Running,
                            pid,
                            Some(started_at),
                        );
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
    });

    // stderr reader
    let app_stderr = app.clone();
    let name_stderr = instance_name.clone();
    let status_stderr = status.clone();
    let startup_reported_stderr = startup_reported.clone();
    tokio::spawn(async move {
        let reader = AsyncBufReader::new(stderr);
        let mut lines = reader.lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    emit_log(&app_stderr, instance_id, &line);
                    append_log(&app_stderr, &name_stderr, &line);

                    // Detect server ready line to mark as Running
                    if line.contains("Dedicated Server now running on Port")
                        && !startup_reported_stderr.load(std::sync::atomic::Ordering::SeqCst)
                    {
                        startup_reported_stderr.store(true, std::sync::atomic::Ordering::SeqCst);
                        *status_stderr.lock().await = ServerStatus::Running;
                        emit_status(
                            &app_stderr,
                            instance_id,
                            &ServerStatus::Running,
                            pid,
                            Some(started_at),
                        );
                    }
                }
                Ok(None) | Err(_) => break,
            }
        }
    });

    // Control loop
    loop {
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
                        {
                            *status.lock().await = ServerStatus::Stopping;
                        }
                        emit_status(&app, instance_id, &ServerStatus::Stopping, pid, Some(started_at));

                        // Step 1: ask the server to stop gracefully.
                        {
                            let mut guard = stdin.lock().await;
                            let _ = guard.write_all(b"/stop\n").await;
                            let _ = guard.flush().await;
                        }

                        // Step 2: wait up to 10s for clean exit.
                        let timeout = tokio::time::timeout(Duration::from_secs(10), child.wait()).await;
                        let new_status = match timeout {
                            Ok(Ok(exit)) => {
                                if exit.success() {
                                    ServerStatus::Stopped
                                } else {
                                    ServerStatus::Crashed { exit_code: exit.code() }
                                }
                            }
                            _ => {
                                // Step 3: escalate to SIGTERM / graceful kill.
                                log_info!("server_hosting: instance {instance_id} did not stop cleanly, escalating");
                                if let Some(p) = pid {
                                    #[cfg(unix)]
                                    unsafe {
                                        let _ = libc::killpg(p as i32, libc::SIGTERM);
                                    }
                                    #[cfg(windows)]
                                    {
                                        let _ = std::process::Command::new("taskkill")
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
                                            ServerStatus::Crashed { exit_code: exit.code() }
                                        }
                                    }
                                    _ => {
                                        // Step 5: force kill.
                                        let _ = child.kill().await;
                                        ServerStatus::Crashed { exit_code: None }
                                    }
                                }
                            }
                        };
                        *status.lock().await = new_status;
                        break;
                    }
                    None => {
                        // All handles dropped; exit actor.
                        break;
                    }
                }
            }

            wait_result = child.wait() => {
                let exit_code = wait_result.ok().and_then(|s| s.code());
                let new_status = match exit_code {
                    Some(0) => ServerStatus::Stopped,
                    _ => ServerStatus::Crashed { exit_code },
                };
                *status.lock().await = new_status;
                break;
            }
        }
    }

    let final_status = {
        let guard = status.lock().await;
        guard.clone()
    };
    unregister(instance_id);
    emit_status(&app, instance_id, &final_status, None, None);
    log_info!(
        "server_hosting: instance {instance_id} exited ({})",
        final_status.as_str()
    );
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

/// Force-kill all running server processes. Called on app shutdown.
pub async fn kill_all() {
    log_info!("server_hosting: killing all running servers on shutdown");
    let ids = running_instance_ids();
    if ids.is_empty() {
        return;
    }
    for id in &ids {
        log_info!("server_hosting: requesting stop for instance {id}");
    }
    let _ = futures_util::future::join_all(ids.iter().copied().map(stop)).await;
    log_info!(
        "server_hosting: stop requests sent for {} server(s)",
        running_instance_ids().len()
    );
}
