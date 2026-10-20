use serde::Deserialize;
use serde_json::{from_str, json, to_string_pretty, Value};
use std::{
    collections::HashMap,
    fs::{create_dir_all, metadata, read_to_string, set_permissions, write, File},
    io::Read,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{command, AppHandle, Emitter, Manager, State};
use tokio::io::AsyncBufReadExt;
use walkdir::WalkDir;

use super::auth::SavedAccount;
use super::backups;
use super::dotnet;
use super::errors::UiError;
use super::game_defaults;
use super::paths::{self, clientsettings_path, mods_dir};
use super::profiles::{
    find_profile_by_id, mark_profile_running, profile_id_for_dir, read_profile_json,
    write_profile_json, ProfileInfo,
};
use super::utils::{display_path, parse_start_params, require_managed_path};
use crate::{log_debug, log_error, log_info};

#[command]
pub async fn initialize_game(app: AppHandle, path: String) -> Result<String, UiError> {
    log_info!("initialize_game: {}", display_path(Path::new(&path)));
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    let pb = mods_dir(PathBuf::from(&path));
    if !pb.exists() {
        create_dir_all(&pb).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory: {e}"),
            }
        })?;
    }
    Ok("initialized".into())
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayGameParams {
    pub profile_id: u64,
    pub server: Option<String>,
    pub password: Option<String>,
    pub save: Option<String>,
    #[serde(default = "default_use_system_dotnet")]
    pub use_system_dotnet: bool,
}

fn default_use_system_dotnet() -> bool {
    true
}

fn load_selected_account(app: &AppHandle) -> Option<SavedAccount> {
    use std::fs::read_to_string;
    use tauri::Manager;
    let data_dir = app.path().app_data_dir().ok()?;
    let path = data_dir.join("accounts.json");
    log_debug!(
        "[play_game] load_selected_account: looking for {}",
        display_path(&path)
    );
    if !path.exists() {
        log_info!(
            "[play_game] load_selected_account: accounts.json not found — no account selected"
        );
        return None;
    }
    let json = match read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            log_error!(
                "[play_game] load_selected_account: failed to read accounts.json: {}",
                e
            );
            return None;
        }
    };
    let accounts: Vec<SavedAccount> = match serde_json::from_str(&json) {
        Ok(a) => a,
        Err(e) => {
            log_error!(
                "[play_game] load_selected_account: failed to parse accounts.json: {}",
                e
            );
            return None;
        }
    };
    let account = accounts
        .iter()
        .find(|a| a.selected)
        .or_else(|| accounts.first())
        .cloned();
    match &account {
        Some(a) => log_info!(
            "[play_game] load_selected_account: found account playername={:?} uid={}",
            a.playername,
            a.uid.as_deref().unwrap_or("<none>")
        ),
        None => log_info!(
            "[play_game] load_selected_account: accounts.json has 0 entries — no account selected"
        ),
    }
    account
}

/// Best-effort: make an existing `clientsettings.json` writable before a launch
/// rewrites it. The game or a sync tool can leave the file read-only, which
/// would otherwise abort the launch with a permission error.
fn ensure_writable(path: &Path) {
    let Ok(metadata) = metadata(path) else {
        return;
    };

    #[cfg(windows)]
    {
        let mut permissions = metadata.permissions();
        if permissions.readonly() {
            permissions.set_readonly(false);
            if let Err(error) = set_permissions(path, permissions) {
                log_error!(
                    "[play_game] could not clear read-only on {}: {error}",
                    path.display()
                );
            }
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = metadata.permissions();
        let mode = permissions.mode();
        if mode & 0o200 == 0 {
            permissions.set_mode(mode | 0o200);
            if let Err(error) = set_permissions(path, permissions) {
                log_error!(
                    "[play_game] could not add owner-write on {}: {error}",
                    path.display()
                );
            }
        }
    }

    #[cfg(not(any(unix, windows)))]
    let _ = metadata;
}

/// Best-effort: keep `clientsettings.json` readable for the game and for tools
/// running outside the launcher's umask.
fn set_shared_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(error) = set_permissions(path, std::fs::Permissions::from_mode(0o644)) {
            log_error!(
                "[play_game] could not set permissions on {}: {error}",
                path.display()
            );
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// Both the user id and the session key are required to sign in; an account
/// missing either cannot produce a usable session.
fn account_has_credentials(account: &SavedAccount) -> bool {
    let filled = |value: &Option<String>| value.as_deref().is_some_and(|v| !v.trim().is_empty());
    filled(&account.uid) && filled(&account.sessionkey)
}

/// Whether the selected account's session is written into `clientsettings.json`.
///
/// Only a definite "expired" verdict — or an account without usable credentials
/// — skips the write. A check that could not run (offline, HTTP error) leaves
/// the session unverified, not invalid, and keeps it usable; the same policy as
/// the launcher-login import.
fn should_inject_account(has_credentials: bool, session_check: Option<bool>) -> bool {
    has_credentials && session_check != Some(false)
}

/// Validates the selected account's stored session, when it has one.
///
/// `None` means the session is unverified (no account or credentials, or the
/// check itself failed) and must not be treated as invalid.
async fn check_session(client: &reqwest::Client, account: &Option<SavedAccount>) -> Option<bool> {
    let account = account.as_ref()?;
    if !account_has_credentials(account) {
        return None;
    }
    let uid = account.uid.as_deref().unwrap_or_default();
    let sessionkey = account.sessionkey.as_deref().unwrap_or_default();
    let check = super::auth::session_is_valid(client, uid, sessionkey).await;
    match check {
        Some(valid) => log_info!("[play_game] session check: valid={valid}"),
        None => log_info!("[play_game] session check: could not verify (offline or auth error)"),
    }
    check
}

/// Builds a launcher account from a `clientsettings.json` session bundle.
/// Returns `None` unless the bundle carries both a user id and a session key.
fn saved_account_from_session(settings: &Value) -> Option<SavedAccount> {
    let strings = settings.get("stringSettings")?.as_object()?;
    let text = |key: &str| {
        strings
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let optional = |key: &str| {
        let value = text(key);
        (!value.is_empty()).then_some(value)
    };
    let uid = optional("playeruid");
    let sessionkey = optional("sessionkey");
    if uid.is_none() || sessionkey.is_none() {
        return None;
    }
    Some(SavedAccount {
        uid,
        email: text("useremail"),
        playername: optional("playername"),
        sessionkey,
        sessionsignature: optional("sessionsignature"),
        selected: true,
    })
}

/// Adopts the stored game session of the selected default profile — or, with no
/// default chosen, of the profile being launched — as the launcher account when
/// none is selected yet, so the launch can validate and reuse it.
///
/// The real sign-in usually happens inside the game: a fresh launcher install
/// has no accounts.json even though the user has a live session on disk.
fn prime_account_from_default_profile(
    app: &AppHandle,
    launched_profile_id: u64,
) -> Option<SavedAccount> {
    let data_dir = app.path().app_data_dir().ok()?;

    // Never touch an existing list; only seed a missing or empty accounts.json.
    let accounts_path = data_dir.join("accounts.json");
    if let Ok(text) = read_to_string(&accounts_path) {
        match from_str::<Vec<SavedAccount>>(&text) {
            Ok(accounts) if !accounts.is_empty() => return None,
            Ok(_) => {}
            Err(error) => {
                log_error!("[play_game] prime account: accounts.json is not readable: {error}");
                return None;
            }
        }
    }

    let (_, source_profile_id, _) = game_defaults::launch_defaults(app);
    let mut candidates: Vec<u64> = source_profile_id.into_iter().collect();
    if !candidates.contains(&launched_profile_id) {
        candidates.push(launched_profile_id);
    }

    for profile_id in candidates {
        let Ok((dir, info)) = find_profile_by_id(app, profile_id) else {
            continue;
        };
        let path = clientsettings_path(&dir);
        let Ok(content) = read_to_string(&path) else {
            continue;
        };
        let Ok(settings) = from_str::<Value>(&content) else {
            log_error!(
                "[play_game] prime account: failed to parse {}",
                path.display()
            );
            continue;
        };
        let Some(account) = saved_account_from_session(&settings) else {
            continue;
        };
        match super::auth::write_accounts(&data_dir, std::slice::from_ref(&account)) {
            Ok(()) => {
                log_info!(
                    "[play_game] primed account from profile '{}' (uid={})",
                    info.name,
                    account.uid.as_deref().unwrap_or("<none>")
                );
                return Some(account);
            }
            Err(error) => {
                log_error!("[play_game] prime account: write failed: {}", error.message);
                return None;
            }
        }
    }
    None
}

#[command]
pub async fn play_game(
    app: AppHandle,
    client: State<'_, Arc<reqwest::Client>>,
    options: Option<PlayGameParams>,
) -> Result<String, UiError> {
    let options = options.ok_or_else(|| UiError {
        name: "invalid_params".into(),
        message: "Invalid play game parameters.".into(),
    })?;
    let (pb, profile) = find_profile_by_id(&app, options.profile_id)?;
    log_info!("[play_game] profile dir: {}", display_path(&pb));
    log_info!(
        "[play_game] profile info: name={}, version={}, startParams={}",
        profile.name,
        profile.version,
        profile.start_params
    );

    // A fresh install has no accounts.json even though the game itself may
    // hold a live session on disk: adopt it so this launch can validate and
    // reuse it, and so the account shows up in the account menu.
    let account = match load_selected_account(&app) {
        Some(account) => Some(account),
        None => prime_account_from_default_profile(&app, options.profile_id),
    };
    let has_credentials = account.as_ref().is_some_and(account_has_credentials);
    let session_check = check_session(&client, &account).await;
    let inject_account = should_inject_account(has_credentials, session_check);
    if account.is_some() && !inject_account {
        log_info!("[play_game] account session not written this launch (expired or incomplete)");
    }

    mark_profile_running(options.profile_id, true);

    // Safety net: archive the profile before the game can touch it. Failures
    // are surfaced through the backup events and never block the launch.
    if profile.backup_on_play {
        let app_for_backup = app.clone();
        let profile_id = options.profile_id;
        match tauri::async_runtime::spawn_blocking(move || {
            backups::run_backup(&app_for_backup, profile_id)
        })
        .await
        {
            Ok(Ok(_)) => {}
            Ok(Err(error)) => {
                log_error!("[play_game] pre-launch backup failed: {}", error.message)
            }
            Err(error) => log_error!("[play_game] pre-launch backup task failed: {error}"),
        }
    }

    let launched = async {
        // Warn the UI before the (possibly slow) runtime setup: the saved
        // session is dead, but the launch still goes ahead.
        if session_check == Some(false) {
            let _ = app.emit(
                &format!("launch-{}", options.profile_id),
                json!({ "status": "session-invalid", "profileId": options.profile_id }),
            );
        }
        let ctx = resolve_launch_context(&app, &pb, &profile, &options).await?;
        prepare_clientsettings(&app, &pb, &profile, &account, inject_account).await?;
        let _ = app.emit(
            &format!("launch-{}", options.profile_id),
            json!({ "status": "pending", "profileId": options.profile_id }),
        );
        let (child, expect_version_line) = spawn_game(&pb, &ctx, &profile, &options).await?;
        watch_process(&app, options.profile_id, pb, child, expect_version_line).await;
        Ok::<(), UiError>(())
    }
    .await;
    if let Err(error) = launched {
        mark_profile_running(options.profile_id, false);
        return Err(error);
    }

    log_info!(
        "play_game: process spawned for profile {}",
        options.profile_id
    );
    Ok("started".into())
}

/// Holds everything resolved before the game process is spawned.
struct LaunchContext {
    dotnet_root: PathBuf,
    combined_path: PathBuf,
    #[cfg(target_os = "macos")]
    app_bundle: Option<PathBuf>,
}

/// Resolve the launch context: .NET runtime, executable path, and macOS bundle.
async fn resolve_launch_context(
    app: &AppHandle,
    _pb: &Path,
    profile: &ProfileInfo,
    options: &PlayGameParams,
) -> Result<LaunchContext, UiError> {
    let app_data = app.path().app_data_dir().map_err(|e| {
        log_error!("profiles: app_data_failed: {e}");
        UiError {
            name: "app_data_failed".into(),
            message: format!("Failed to get app data dir: {e}"),
        }
    })?;

    let dotnet_root = dotnet::ensure_dotnet(
        app,
        &app_data,
        super::versions::base_game_version(&profile.version),
        options.profile_id,
        options.use_system_dotnet,
    )
    .await?;
    log_info!("[play_game] DOTNET_ROOT={}", display_path(&dotnet_root));

    let version_path = super::versions::resolve_version_dir(app, &profile.version)?;
    log_info!("[play_game] version_path: {}", display_path(&version_path));
    if !version_path.exists() || !version_path.is_dir() {
        return Err(UiError::not_found(format!(
            "Version directory not found: {}",
            version_path.display()
        )));
    }

    let combined_path = find_game_executable(&version_path).await?;
    log_info!("[play_game] using exe: {}", display_path(&combined_path));

    #[cfg(target_os = "macos")]
    let app_bundle = macos::resolve_app_bundle(&version_path, &combined_path).await?;

    Ok(LaunchContext {
        dotnet_root,
        combined_path,
        #[cfg(target_os = "macos")]
        app_bundle,
    })
}

/// Search the version directory for the Vintage Story executable.
async fn find_game_executable(version_path: &Path) -> Result<PathBuf, UiError> {
    tokio::task::spawn_blocking({
        let version_path = version_path.to_path_buf();
        move || {
            let exe_name = paths::vintagestory_exe();

            #[cfg(target_os = "macos")]
            {
                // On macOS, prefer binaries inside a .app bundle.
                for entry in WalkDir::new(&version_path).min_depth(3).max_depth(4) {
                    let entry = entry.map_err(|e| {
                        log_error!("profiles: walkdir error: {e}");
                        UiError::new("io_error", format!("walkdir error: {e}"))
                    })?;
                    if entry.file_type().is_file() {
                        let fname = entry.file_name().to_string_lossy();
                        if fname.eq_ignore_ascii_case(exe_name) {
                            let p = entry.path();
                            if macos::is_inside_app_bundle(p) {
                                return Ok(p.to_path_buf());
                            }
                        }
                    }
                }
            }

            // Fallback: search the whole version tree.
            for entry in WalkDir::new(&version_path) {
                let entry = entry.map_err(|e| {
                    log_error!("profiles: walkdir error: {e}");
                    UiError::new("io_error", format!("walkdir error: {e}"))
                })?;
                if entry.file_type().is_file() {
                    let fname = entry.file_name().to_string_lossy();
                    if fname.eq_ignore_ascii_case(exe_name) {
                        return Ok(entry.path().to_path_buf());
                    }
                }
            }

            Err(UiError::from(
                "Could not find Vintage Story executable in profile path",
            ))
        }
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("spawn blocking error: {e}")))?
}

/// Write or update clientsettings.json for the launch, merging in the selected
/// account's session (unless the pre-launch check found it expired) and the
/// shared game defaults.
async fn prepare_clientsettings(
    app: &AppHandle,
    pb: &Path,
    profile: &ProfileInfo,
    account: &Option<SavedAccount>,
    inject_account: bool,
) -> Result<(), UiError> {
    // The shared game defaults are read here, on the main thread, because the
    // write below happens on a blocking task without an AppHandle. The source
    // profile's file is read live, so changes made there carry over; the source
    // profile itself is never overwritten with its own settings.
    let (apply_game_defaults, source_profile_id, include_session) =
        game_defaults::launch_defaults(app);
    let defaults = if apply_game_defaults {
        match source_profile_id {
            Some(id) if profile_id_for_dir(pb) != id => {
                game_defaults::live_snapshot(app, id, include_session)
            }
            Some(_) => {
                log_info!("[play_game] game defaults skipped — this is the source profile");
                None
            }
            None => None,
        }
    } else {
        None
    };
    tokio::task::spawn_blocking({
        let account = account.clone();
        let pb = pb.to_path_buf();
        let profile = profile.clone();
        move || {
            write_clientsettings(
                &pb,
                &profile,
                &account,
                inject_account,
                &defaults,
                apply_game_defaults,
            )
        }
    })
    .await
    .map_err(|e| UiError::new("internal_error", format!("spawn blocking error: {e}")))?
}

fn write_clientsettings(
    pb: &Path,
    profile: &ProfileInfo,
    account: &Option<SavedAccount>,
    inject_account: bool,
    defaults: &Option<Value>,
    apply_game_defaults: bool,
) -> Result<(), UiError> {
    let settings_path = clientsettings_path(pb);
    log_info!(
        "[play_game] clientsettings.json path: {}",
        display_path(&settings_path)
    );

    let mut settings_json: Value = if settings_path.exists() {
        log_info!("[play_game] reading existing clientsettings.json");
        let mut existing = String::new();
        File::open(&settings_path)
            .and_then(|mut f| f.read_to_string(&mut existing))
            .map_err(|e| {
                log_error!("profiles: read_failed: {e}");
                UiError {
                    name: "read_failed".into(),
                    message: format!("Failed to read clientsettings.json: {e}"),
                }
            })?;
        from_str(&existing).unwrap_or(json!({}))
    } else {
        log_info!("[play_game] clientsettings.json does not exist — creating new");
        create_dir_all(settings_path.parent().unwrap()).map_err(|e| {
            log_error!("profiles: create_dir_failed: {e}");
            UiError {
                name: "create_dir_failed".into(),
                message: format!("Failed to create directory for clientsettings.json: {e}"),
            }
        })?;
        json!({})
    };

    if let Some(obj) = settings_json.as_object_mut() {
        // Always set modPaths so Vintage Story picks up the Mods directory
        let mods_path = mods_dir(pb).to_string_lossy().into_owned();
        log_info!(
            "[play_game] setting modPaths in stringListSettings to [\"{}\", \"Mods\"]",
            mods_path
        );
        if let Some(string_list_settings) = obj
            .get_mut("stringListSettings")
            .and_then(|v| v.as_object_mut())
        {
            if let Some(mod_paths) = string_list_settings
                .get_mut("modPaths")
                .and_then(|v| v.as_array_mut())
            {
                *mod_paths = vec![json!(mods_path), json!(paths::MODS_DIR)];
                log_info!("[play_game] updated existing modPaths");
            } else {
                string_list_settings.insert("modPaths".into(), json!([mods_path, paths::MODS_DIR]));
                log_info!("[play_game] inserted modPaths into existing stringListSettings");
            }
        } else {
            obj.insert(
                "stringListSettings".into(),
                json!({ "modPaths": [mods_path, paths::MODS_DIR] }),
            );
            log_info!("[play_game] created stringListSettings with modPaths");
        }

        // Merge the selected account's credentials into stringSettings. An
        // expired session is left out on purpose: writing it over a possibly
        // newer in-game session would force the login screen for no reason.
        if let (Some(account), true) = (account.as_ref(), inject_account) {
            log_info!(
                "[play_game] merging account settings — playername={:?} uid={}",
                account.playername,
                account.uid.as_deref().unwrap_or("<none>")
            );
            let account_settings = json!({
                "playeruid": account.uid.as_deref().unwrap_or(""),
                "sessionkey": account.sessionkey.as_deref().unwrap_or(""),
                "sessionsignature": account.sessionsignature.as_deref().unwrap_or(""),
                "playername": account.playername.as_deref().unwrap_or(""),
            });
            if let Some(string_settings) = obj
                .get_mut("stringSettings")
                .and_then(|v| v.as_object_mut())
            {
                for (k, v) in account_settings.as_object().unwrap() {
                    string_settings.insert(k.clone(), v.clone());
                }
                log_info!("[play_game] merged account keys into existing stringSettings");
            } else {
                obj.insert("stringSettings".into(), account_settings);
                log_info!("[play_game] inserted new stringSettings with account keys");
            }
        } else if account.is_some() {
            log_info!("[play_game] account session not written — expired or incomplete");
        } else {
            log_info!(
                "[play_game] no selected account — writing modPaths only (no account injection)"
            );
        }
    }

    // Finally merge the shared game defaults (key bindings + game/video
    // settings), read live from the source profile. The account merge above
    // injects the selected launcher account's session, so a source session
    // only applies when no account is selected.
    if apply_game_defaults && !profile.ignore_game_defaults {
        if let Some(defaults) = defaults.as_ref() {
            let allow_session = account.is_none();
            let written =
                game_defaults::apply_defaults(&mut settings_json, defaults, allow_session);
            log_info!(
                "[play_game] applied {} shared game default settings",
                written
            );
            if game_defaults::carries_session(defaults) && !allow_session {
                log_info!(
                    "[play_game] copied account session skipped — a launcher account is selected"
                );
            }
        }
    } else if apply_game_defaults {
        log_info!("[play_game] game defaults skipped — profile opted out");
    }

    ensure_writable(&settings_path);
    write(&settings_path, to_string_pretty(&settings_json).unwrap()).map_err(|e| {
        log_error!("profiles: write_failed: {e}");
        UiError {
            name: "write_failed".into(),
            message: format!("Failed to write clientsettings.json: {e}"),
        }
    })?;
    set_shared_permissions(&settings_path);
    log_info!("[play_game] clientsettings.json written successfully");
    Ok(())
}

/// Spawn the game process and return the `Child` handle, plus whether we
/// should wait for a version line on stdout/stderr.
async fn spawn_game(
    pb: &Path,
    ctx: &LaunchContext,
    profile: &ProfileInfo,
    options: &PlayGameParams,
) -> Result<(tokio::process::Child, bool), UiError> {
    let start_params = profile.start_params.as_str();

    #[cfg(target_os = "macos")]
    let (child, expect_version_line) = if let Some(ref app_bundle) = ctx.app_bundle {
        (
            macos::spawn_via_open(
                app_bundle,
                pb,
                &ctx.dotnet_root,
                options,
                start_params,
                &profile.env_vars,
            )
            .await?,
            false,
        )
    } else {
        (
            spawn_direct(
                &ctx.combined_path,
                pb,
                &ctx.dotnet_root,
                options,
                start_params,
                &profile.env_vars,
            )
            .await?,
            true,
        )
    };

    #[cfg(not(target_os = "macos"))]
    let (child, expect_version_line) = (
        spawn_direct(
            &ctx.combined_path,
            pb,
            &ctx.dotnet_root,
            options,
            start_params,
            &profile.env_vars,
        )
        .await?,
        true,
    );

    Ok((child, expect_version_line))
}

async fn spawn_direct(
    exe: &Path,
    data_path: &Path,
    dotnet_root: &Path,
    options: &PlayGameParams,
    start_params: &str,
    env_vars: &HashMap<String, String>,
) -> Result<tokio::process::Child, UiError> {
    log_info!(
        "[play_game] SPAWNING direct: {:?} --dataPath {:?} DOTNET_ROOT={:?}",
        exe,
        data_path,
        dotnet_root
    );

    let mut cmd = tokio::process::Command::new(exe);
    cmd.env("DOTNET_ROOT", dotnet_root)
        .env("DOTNET_ROLL_FORWARD", "LatestMinor")
        .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
        .kill_on_drop(false)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (key, value) in env_vars {
        cmd.env(key, value);
    }

    let mut args: Vec<String> = vec![
        "--dataPath".into(),
        data_path.to_string_lossy().into_owned(),
    ];

    if let Some(ref save) = options.save {
        let save_path = Path::new(save);
        let file_stem = save_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        args.push("-o".into());
        args.push(file_stem);
    }
    if let Some(ref server) = options.server {
        args.push("--connect".into());
        args.push(server.clone());
    }
    if let Some(ref password) = options.password {
        args.push("--pw".into());
        args.push(password.clone());
    }

    cmd.args(&args);
    cmd.args(parse_start_params(start_params)?);

    cmd.spawn().map_err(|e| {
        log_error!("profiles: launch_failed: {e}");
        UiError {
            name: "launch_failed".into(),
            message: format!("Failed to launch: {e}"),
        }
    })
}

/// Watch the launched process: emit success when the game reports its version,
/// emit timeout if it doesn't, and update playtime when it exits.
async fn watch_process(
    app: &AppHandle,
    profile_id: u64,
    profile_dir: PathBuf,
    mut child: tokio::process::Child,
    expect_version_line: bool,
) {
    let app = app.clone();
    tokio::spawn(async move {
        let target_prefix = "Client Notification] Game Version:";
        let timeout = Duration::from_secs(25);
        let start = Instant::now();

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let found = Arc::new(AtomicBool::new(false));

        if expect_version_line {
            let found_stdout = found.clone();
            let found_stderr = found.clone();
            let app_stdout = app.clone();
            let app_stderr = app.clone();

            // stdout watcher
            if let Some(stdout) = stdout {
                tokio::spawn(async move {
                    let reader = tokio::io::BufReader::new(stdout);
                    let mut lines = reader.lines();
                    while start.elapsed() < timeout {
                        if found_stdout.load(Ordering::Relaxed) {
                            break;
                        }
                        match lines.next_line().await {
                            Ok(Some(line)) => {
                                log_debug!("[play_game] stdout: {}", line);
                                if let Some(idx) = line.find(target_prefix) {
                                    let version = line[idx + target_prefix.len()..].trim();
                                    let _ = app_stdout.emit(
                                        &format!("launch-{profile_id}"),
                                        json!({
                                            "status": "success",
                                            "profileId": profile_id,
                                            "version": version,
                                            "line": line,
                                        }),
                                    );
                                    found_stdout.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                });
            }

            // stderr watcher
            if let Some(stderr) = stderr {
                tokio::spawn(async move {
                    let reader = tokio::io::BufReader::new(stderr);
                    let mut lines = reader.lines();
                    while start.elapsed() < timeout {
                        if found_stderr.load(Ordering::Relaxed) {
                            break;
                        }
                        match lines.next_line().await {
                            Ok(Some(line)) => {
                                log_debug!("[play_game] stderr: {}", line);
                                if let Some(idx) = line.find(target_prefix) {
                                    let version = line[idx + target_prefix.len()..].trim();
                                    let _ = app_stderr.emit(
                                        &format!("launch-{profile_id}"),
                                        json!({
                                            "status": "success",
                                            "profileId": profile_id,
                                            "version": version,
                                            "line": line,
                                        }),
                                    );
                                    found_stderr.store(true, Ordering::Relaxed);
                                    break;
                                }
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                });
            }

            // Timeout monitor
            tokio::spawn({
                let app = app.clone();
                let found = found.clone();
                async move {
                    tokio::time::sleep(timeout).await;
                    if !found.load(Ordering::Relaxed) {
                        log_error!("[play_game] TIMEOUT after {}ms", timeout.as_millis());
                        let _ = app.emit(
                            &format!("launch-{profile_id}"),
                            json!({
                                "status": "error",
                                "profileId": profile_id,
                                "reason": "timeout",
                                "waitedMs": timeout.as_millis(),
                            }),
                        );
                    }
                }
            });
        } else {
            // macOS .app bundles are launched via `open`; the game output is not
            // piped through, so report success immediately.
            let _ = app.emit(
                &format!("launch-{profile_id}"),
                json!({
                    "status": "success",
                    "profileId": profile_id,
                    "version": "launched via .app bundle",
                }),
            );
        }

        // Wait for exit and update playtime
        let start_time = Instant::now();
        match child.wait().await {
            Ok(exit_status) => {
                let elapsed = start_time.elapsed().as_secs();
                log_info!("[play_game] process exited with status: {:?}", exit_status);
                log_info!("[play_game] session duration: {}s", elapsed);
                update_profile_playtime(&profile_dir, profile_id, elapsed, &app);
            }
            Err(e) => {
                log_error!("[play_game] failed to wait for process: {e}");
            }
        }
        mark_profile_running(profile_id, false);
    });
}

fn update_profile_playtime(profile_dir: &Path, profile_id: u64, elapsed: u64, app: &AppHandle) {
    match read_profile_json(profile_dir) {
        Ok(mut info) => {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            info.last_played = Some(now_ms);
            info.total_time_played += elapsed;
            let total = info.total_time_played;

            match write_profile_json(profile_dir, &info) {
                Ok(()) => {
                    let _ = app.emit(
                        &format!("game-quit-{profile_id}"),
                        json!({
                            "profileId": profile_id,
                            "elapsedSeconds": elapsed,
                            "lastPlayed": now_ms,
                            "totalTimePlayed": total,
                        }),
                    );
                }
                Err(e) => {
                    log_error!("[play_game] failed to write profile.json: {}", e.message);
                }
            }
        }
        Err(e) => {
            log_error!("[play_game] failed to read profile.json: {}", e.message);
        }
    }
}

/// macOS-specific launch helpers.
#[cfg(target_os = "macos")]
pub mod macos {
    use super::*;

    /// Returns true if `path` is located inside a `.app` bundle.
    pub fn is_inside_app_bundle(path: &Path) -> bool {
        let mut ancestor = path.parent();
        while let Some(dir) = ancestor {
            if dir.extension().map(|e| e == "app") == Some(true) {
                return true;
            }
            ancestor = dir.parent();
        }
        false
    }

    /// Resolve the .app bundle for the executable, restructuring old installs if needed.
    pub async fn resolve_app_bundle(
        version_path: &Path,
        combined_path: &Path,
    ) -> Result<Option<PathBuf>, UiError> {
        // Walk up from the binary to find any .app ancestor
        let mut app_ancestor: Option<&Path> = None;
        let mut ancestor = combined_path.parent();
        while let Some(dir) = ancestor {
            if dir.extension().map(|e| e == "app") == Some(true) {
                app_ancestor = Some(dir);
                break;
            }
            ancestor = dir.parent();
        }

        if let Some(existing) = app_ancestor {
            log_info!(
                "[play_game] macOS: using existing .app bundle at {:?}",
                existing
            );
            return Ok(Some(existing.to_path_buf()));
        }

        // No existing .app bundle. Restructure old profile if needed.
        let app_bundle = version_path.join("Vintage Story.app");
        if !app_bundle.exists() {
            log_info!(
                "[play_game] macOS: restructuring old profile into {:?}",
                app_bundle
            );
            restructure_into_app_bundle(version_path, &app_bundle).map_err(|e| {
                log_error!("[play_game] macOS: failed to restructure .app bundle: {e}");
                UiError::new(
                    "io_error",
                    format!("Failed to restructure .app bundle: {e}"),
                )
            })?;
        } else {
            log_info!(
                "[play_game] macOS: using previously restructured .app bundle at {:?}",
                app_bundle
            );
        }

        Ok(Some(app_bundle))
    }

    fn restructure_into_app_bundle(
        version_path: &Path,
        app_bundle: &Path,
    ) -> Result<(), std::io::Error> {
        std::fs::create_dir_all(app_bundle)?;

        if version_path.is_dir() {
            for entry in std::fs::read_dir(version_path)? {
                let entry = entry?;
                let src = entry.path();
                if src == app_bundle {
                    continue;
                }
                let dst = app_bundle.join(entry.file_name());
                std::fs::rename(&src, &dst)?;
            }
        }

        let plist = app_bundle.join("Info.plist");
        if !plist.exists() {
            log_error!(
                "[play_game] macOS: WARNING - no Info.plist in .app bundle after restructuring"
            );
        }

        Ok(())
    }

    /// Launch the game via `open` on macOS so Info.plist is read.
    pub async fn spawn_via_open(
        app_bundle: &Path,
        data_path: &Path,
        dotnet_root: &Path,
        options: &PlayGameParams,
        start_params: &str,
        _env_vars: &HashMap<String, String>,
    ) -> Result<tokio::process::Child, UiError> {
        log_info!(
            "[play_game] SPAWNING via open: open -W -a {:?} --args --dataPath {:?} DOTNET_ROOT={:?}",
            app_bundle,
            data_path,
            dotnet_root
        );

        let mut open_args: Vec<String> = vec![
            "--dataPath".to_string(),
            data_path.to_string_lossy().to_string(),
        ];

        if let Some(ref save) = options.save {
            let save_path = Path::new(save);
            let file_stem = save_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            open_args.push("-o".to_string());
            open_args.push(file_stem);
        }
        if let Some(ref server) = options.server {
            open_args.push("--connect".to_string());
            open_args.push(server.clone());
        }
        if let Some(ref password) = options.password {
            open_args.push("--pw".to_string());
            open_args.push(password.clone());
        }
        open_args.extend(parse_start_params(start_params)?);

        tokio::process::Command::new("open")
            .env("DOTNET_ROOT", dotnet_root)
            .env("DOTNET_ROLL_FORWARD", "LatestMinor")
            .env("DOTNET_ROLL_FORWARD_TO_PRERELEASE", "0")
            .kill_on_drop(false)
            .arg("-W")
            .arg("-a")
            .arg(app_bundle)
            .arg("--args")
            .args(&open_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                log_error!("profiles: launch_failed: {e}");
                UiError {
                    name: "launch_failed".into(),
                    message: format!("Failed to launch via open: {e}"),
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Only a definite "expired" verdict skips writing the session; an
    /// unreachable check is unverified, not invalid.
    #[test]
    fn session_injection_needs_credentials_and_no_expired_verdict() {
        assert!(should_inject_account(true, Some(true)));
        assert!(should_inject_account(true, None));
        assert!(!should_inject_account(true, Some(false)));
        assert!(!should_inject_account(false, Some(true)));
        assert!(!should_inject_account(false, None));
    }

    #[test]
    fn account_credentials_require_uid_and_session_key() {
        let account = |uid: Option<&str>, sessionkey: Option<&str>| SavedAccount {
            uid: uid.map(str::to_string),
            email: "player@example.com".into(),
            playername: Some("Player".into()),
            sessionkey: sessionkey.map(str::to_string),
            sessionsignature: None,
            selected: true,
        };
        assert!(account_has_credentials(&account(Some("uid"), Some("key"))));
        assert!(!account_has_credentials(&account(Some("uid"), None)));
        assert!(!account_has_credentials(&account(None, Some("key"))));
        assert!(!account_has_credentials(&account(Some("  "), Some("key"))));
        assert!(!account_has_credentials(&account(Some("uid"), Some(""))));
    }

    /// Priming reads the session bundle the game itself writes into
    /// clientsettings.json; both the uid and the session key must be present.
    #[test]
    fn saved_account_from_session_reads_launcher_bundle() {
        let settings = json!({
            "stringSettings": {
                "playeruid": "abc123",
                "sessionkey": "key456",
                "sessionsignature": "sig789",
                "playername": "Player",
                "useremail": "player@example.com",
                "unrelated": "value"
            }
        });
        let account = saved_account_from_session(&settings).unwrap();
        assert_eq!(account.uid.as_deref(), Some("abc123"));
        assert_eq!(account.sessionkey.as_deref(), Some("key456"));
        assert_eq!(account.sessionsignature.as_deref(), Some("sig789"));
        assert_eq!(account.playername.as_deref(), Some("Player"));
        assert_eq!(account.email, "player@example.com");
        assert!(account.selected);

        // Missing session key or uid, empty values, no section: no account.
        let without_key = json!({ "stringSettings": { "playeruid": "abc123" } });
        assert!(saved_account_from_session(&without_key).is_none());
        let without_uid = json!({ "stringSettings": { "sessionkey": "key456" } });
        assert!(saved_account_from_session(&without_uid).is_none());
        let empty = json!({ "stringSettings": { "playeruid": "", "sessionkey": "key456" } });
        assert!(saved_account_from_session(&empty).is_none());
        assert!(saved_account_from_session(&json!({})).is_none());

        // Optional fields may be absent entirely.
        let minimal =
            json!({ "stringSettings": { "playeruid": "abc123", "sessionkey": "key456" } });
        let account = saved_account_from_session(&minimal).unwrap();
        assert_eq!(account.email, "");
        assert_eq!(account.playername, None);
        assert_eq!(account.sessionsignature, None);
    }
}
