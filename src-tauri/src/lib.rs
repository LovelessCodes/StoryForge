pub mod modules;
use modules::{
    auth, backups, cairn, download, game_data, game_defaults, gruntlauncher, launcher_logins,
    legacy, lithic, maps, modpack_io, mods, mvl, news, optimum, packs, profile_ops, profiles,
    rustory, saves, screenshots, server_hosting, servers, sniffer, versions, vs_launcher, waxlight,
    yelloowstone,
};
use tauri::RunEvent;

// ── Logging macros (crate root so accessible everywhere) ──

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        $crate::modules::logger::log("INFO ", &msg);
    }};
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        $crate::modules::logger::log("DEBUG", &msg);
    }};
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        $crate::modules::logger::log("ERROR", &msg);
    }};
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

/// Configured `minWidth`/`minHeight` of the main window (`900x600` fallback).
fn configured_min_window_size(app: &tauri::App) -> (f64, f64) {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .and_then(|window| Some((window.min_width?, window.min_height?)))
        .unwrap_or((900.0, 600.0))
}

/// A size grown to `min` when it is below either dimension, otherwise `None`.
fn clamped_logical_size(
    size: tauri::LogicalSize<f64>,
    min: (f64, f64),
) -> Option<tauri::LogicalSize<f64>> {
    if size.width >= min.0 && size.height >= min.1 {
        return None;
    }
    Some(tauri::LogicalSize::new(
        size.width.max(min.0),
        size.height.max(min.1),
    ))
}

/// Grows a window back to the minimum when its size (usually a restored state)
/// is below it. Returns `true` when a resize was applied.
fn clamp_window_to_min(window: &tauri::WebviewWindow, min: (f64, f64)) -> bool {
    let Ok(scale) = window.scale_factor() else {
        return false;
    };
    let Ok(size) = window.inner_size() else {
        return false;
    };
    let Some(target) = clamped_logical_size(size.to_logical::<f64>(scale), min) else {
        return false;
    };
    let _ = window.set_size(target);
    true
}

/// Minimum overlap a restored window must keep on a monitor before it is
/// considered visible (logical pixels; scaled by the window's factor below).
const MIN_VISIBLE_ON_SCREEN: f64 = 100.0;
/// How long after startup position corrections are applied. The window-state
/// plugin restores within the first frames; afterwards the user must be able
/// to place the window freely.
const STARTUP_POSITION_WINDOW: Duration = Duration::from_millis(2000);

/// True when `window` overlaps `monitor` by at least the given margins
/// (`x, y, width, height` in the same coordinate space).
fn rects_overlap(
    window: (f64, f64, f64, f64),
    monitor: (f64, f64, f64, f64),
    margin_w: f64,
    margin_h: f64,
) -> bool {
    let (wx, wy, ww, wh) = window;
    let (mx, my, mw, mh) = monitor;
    let overlap_w = (wx + ww).min(mx + mw) - wx.max(mx);
    let overlap_h = (wy + wh).min(my + mh) - wy.max(my);
    overlap_w >= margin_w && overlap_h >= margin_h
}

/// Moves a restored window back onto a monitor when its saved position leaves
/// almost none of it visible (the window-state plugin only requires a 1px
/// intersection, which a changed monitor layout can still satisfy). Returns
/// `true` when the window was moved.
fn ensure_window_on_screen(window: &tauri::WebviewWindow) -> bool {
    let (Ok(position), Ok(size), Ok(monitors)) = (
        window.outer_position(),
        window.outer_size(),
        window.available_monitors(),
    ) else {
        return false;
    };
    let win = (
        position.x as f64,
        position.y as f64,
        size.width as f64,
        size.height as f64,
    );
    let scale = window.scale_factor().unwrap_or(1.0);
    let margin = MIN_VISIBLE_ON_SCREEN * scale;

    let visible = monitors.iter().any(|monitor| {
        let m_pos = monitor.position();
        let m_size = monitor.size();
        rects_overlap(
            win,
            (
                m_pos.x as f64,
                m_pos.y as f64,
                m_size.width as f64,
                m_size.height as f64,
            ),
            margin,
            margin,
        )
    });
    if visible {
        return false;
    }

    // Fall back to the primary monitor (or the first one available), centered.
    let target = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.first().cloned());
    let Some(monitor) = target else {
        return false;
    };
    let m_pos = monitor.position();
    let m_size = monitor.size();
    let x = m_pos.x as f64 + ((m_size.width as f64 - win.2) / 2.0).max(0.0);
    let y = m_pos.y as f64 + ((m_size.height as f64 - win.3) / 2.0).max(0.0);
    let _ = window.set_position(tauri::PhysicalPosition::new(
        x.round() as i32,
        y.round() as i32,
    ));
    true
}

/// Returns `true` if the application is running inside a Flatpak sandbox.
/// Flatpak manages updates via Flathub; our bundled updater must be disabled.
#[tauri::command]
fn is_flatpak_cmd() -> bool {
    std::env::var("FLATPAK_ID").is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Apply a workaround to fix common rendering issues for NVIDIA GPUs running on Linux under Wayland.
        // See: https://github.com/tauri-apps/tauri/issues/9304
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    let is_flatpak = std::env::var("FLATPAK_ID").is_ok();
    if is_flatpak {
        eprintln!("[StoryForge] Running inside Flatpak — auto-update disabled");
    }

    let mut builder = tauri::Builder::default()
        // Must come before the deep-link plugin: on Windows/Linux it forwards
        // `storyforge://` URLs to the running instance instead of starting a
        // second one. macOS routes the URL through the OS.
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    // Flatpak manages updates through its own mechanism (Flathub) —
    // registering the updater plugin would be pointless and could cause errors.
    if !is_flatpak {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder = builder
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_handle = app.handle();

            // ── Window placement ──
            // The window-state plugin restores the previous size and position
            // verbatim: the size can predate the configured minimum, and the
            // position can land almost entirely offscreen after a monitor
            // layout change. Clamp the size, pull a hidden window back onto a
            // monitor, and keep checking briefly while the restore lands.
            if let Some(window) = app.get_webview_window("main") {
                let min = configured_min_window_size(app);
                if clamp_window_to_min(&window, min) {
                    log_info!("startup: clamped the window to the configured minimum");
                }
                if ensure_window_on_screen(&window) {
                    log_info!("startup: moved the window back onto a monitor");
                }

                // Stop correcting positions shortly after startup: the
                // restore lands within the first frames, and afterwards the
                // user must be able to place the window freely.
                let positioning = Arc::new(AtomicBool::new(true));
                {
                    let positioning = positioning.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(STARTUP_POSITION_WINDOW);
                        positioning.store(false, Ordering::SeqCst);
                    });
                }

                let window_for_events = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Resized(_) => {
                        clamp_window_to_min(&window_for_events, min);
                    }
                    tauri::WindowEvent::Moved(_) if positioning.load(Ordering::SeqCst) => {
                        ensure_window_on_screen(&window_for_events);
                    }
                    _ => {}
                });
            }

            // ── Step 0: Init logger ──
            // Use app_data_dir()/logs/ so the LogViewer can find the file.
            let log_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir")
                .join("logs");
            let _ = std::fs::create_dir_all(&log_dir);
            app_handle
                .plugin(
                    tauri_plugin_log::Builder::new()
                        .target(tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::Folder {
                                path: log_dir,
                                file_name: Some("app".into()),
                            },
                        ))
                        .max_file_size(50_000 /* bytes */)
                        .level(log::LevelFilter::Info)
                        .format(|out, message, record| {
                            out.finish(format_args!("[{}] {}", record.level(), message))
                        })
                        .build(),
                )
                .expect("Failed to init log plugin");

            // Log startup info
            let startup_start = std::time::Instant::now();
            if let Ok(data_dir) = app_handle.path().app_data_dir() {
                log_info!("App started, data dir: {:?}", data_dir);
            } else {
                log_error!("FATAL: Failed to resolve app_data_dir");
                panic!("Failed to resolve app_data_dir");
            }

            // ── Step 1: Create store directory ──
            log_info!("Setup step 1: creating store directory...");
            let t1 = std::time::Instant::now();
            let store_path = match app.path().app_data_dir() {
                Ok(dir) => dir.join(modules::paths::STORE_DIR),
                Err(e) => {
                    log_error!("Failed to get app_data_dir for store: {}", e);
                    panic!("Failed to get app_data_dir for store: {}", e);
                }
            };
            if let Err(e) = std::fs::create_dir_all(&store_path) {
                log_error!("Failed to create store directory {:?}: {}", store_path, e);
                panic!("Failed to create store directory: {}", e);
            }
            log_info!("Setup step 1 done: store dir created at {:?}", store_path);
            modules::logger::log_elapsed("Setup step 1 elapsed", t1);

            // ── Step 2: Init zustand plugin ──
            log_info!("Setup step 2: initializing zustand plugin...");
            let t2 = std::time::Instant::now();
            app_handle
                .plugin(
                    tauri_plugin_zustand::Builder::new()
                        .path(store_path.clone())
                        .build(),
                )
                .map_err(|e| {
                    log_error!("Failed to initialize zustand plugin: {}", e);
                    e
                })?;
            log_info!("Setup step 2 done: zustand plugin initialized");
            modules::logger::log_elapsed("Setup step 2 elapsed", t2);

            // ── Step 2.5: Shared HTTP client ──
            log_info!("Setup step 2.5: initializing shared HTTP client...");
            let t2_5 = std::time::Instant::now();
            let http_client = Arc::new(
                reqwest::Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .user_agent(concat!("StoryForge/", env!("CARGO_PKG_VERSION")))
                    .build()
                    .map_err(|e| {
                        log_error!("Failed to build HTTP client: {e}");
                        e
                    })?,
            );
            app_handle.manage(http_client);
            log_info!("Setup step 2.5 done: shared HTTP client ready");
            modules::logger::log_elapsed("Setup step 2.5 elapsed", t2_5);

            // The main window is declared in tauri.conf.json (overlay titlebar
            // style on macOS, matching the app's custom title bar).

            // ── Step 3: Setup complete ──
            log_info!("Setup complete – app is running");
            modules::logger::log_elapsed("Total Rust setup elapsed", startup_start);
            modules::logger::mark_webview_start();
            Ok(())
        })
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            is_flatpak_cmd,
            // Authorization
            auth::login,
            auth::verify,
            auth::save_accounts,
            auth::load_accounts,
            // Saved logins from other launchers
            launcher_logins::detect_launcher_logins,
            launcher_logins::import_launcher_logins,
            // News
            news::fetch_news,
            // Game defaults (live source profile settings applied on launch)
            game_defaults::preview_game_defaults,
            // Mods
            mods::fetch_mod_tags,
            mods::fetch_mods,
            mods::fetch_mod_info,
            mods::fetch_authors,
            mods::get_mods,
            mods::get_mod_dependencies,
            mods::get_mod_configs,
            mods::get_mod_updates,
            mods::get_profile_mods,
            mods::add_mod_to_profile,
            mods::download_mod,
            mods::remove_mod_from_profile,
            mods::save_mod_config,
            // Modpack manifests (RiftLauncher-compatible import/export)
            modpack_io::read_modpack_manifest,
            modpack_io::write_modpack_manifest,
            // Download
            download::get_download_links,
            download::get_download_link,
            download::download_and_maybe_extract,
            download::scan_resume_manifests,
            download::discard_download,
            // Versions
            versions::fetch_versions,
            versions::get_installed_versions,
            versions::remove_installed_version,
            versions::move_versions_folder,
            versions::remove_all_versions,
            versions::detect_linkable_versions,
            versions::link_external_versions,
            versions::unregister_external_version,
            // Optimum (client fork) overlay install
            optimum::get_optimum_status,
            optimum::install_optimum,
            // Profile pack locks (pin, verify, sync/repair)
            packs::create_profile_lock,
            packs::get_profile_lock_status,
            packs::remove_profile_lock,
            packs::apply_profile_lock,
            // Logger
            modules::logger::log_message,
            modules::logger::log_startup_time,
            modules::logger::log_webview_gap,
            modules::logger::get_logs,
            // Profiles
            profiles::get_all_profiles,
            profiles::save_profile,
            profiles::set_profile_game_defaults,
            profiles::import_profile,
            profiles::play_game,
            profiles::confirm_vintage_story_exe,
            profiles::initialize_game,
            profiles::reveal_in_file_explorer,
            profiles::remove_profile,
            profiles::move_profiles_folder,
            profiles::remove_all_profiles,
            profiles::rename_profiles_folder,
            profiles::get_profile_logs,
            profiles::read_profile_log,
            profiles::zip_modconfig,
            profiles::set_profile_backup_settings,
            backups::list_profile_backups,
            backups::create_profile_backup,
            backups::restore_profile_backup,
            backups::delete_profile_backup,
            // Profile lifecycle (Macheim-style)
            profile_ops::clone_profile,
            profile_ops::rename_profile,
            profile_ops::soft_delete_profile,
            profile_ops::list_deleted_profiles,
            profile_ops::restore_deleted_profile,
            profile_ops::purge_deleted_profile,
            profile_ops::purge_deleted_profiles,
            profile_ops::export_profile,
            profile_ops::export_profile_file,
            profile_ops::export_profile_code,
            profile_ops::import_profile_code,
            profile_ops::read_profile_file,
            // Legacy installations migration (previous Story Forge release)
            legacy::detect_legacy_installations,
            legacy::migrate_legacy_installations,
            // Existing game data adoption
            game_data::detect_default_game_data,
            game_data::adopt_game_data,
            game_data::unregister_external_profile,
            // VS Launcher (XurxoMF) installation import
            vs_launcher::detect_vs_launcher_installations,
            vs_launcher::import_vs_launcher_installations,
            // MVL (scgm0) modpack import
            mvl::detect_mvl_modpacks,
            mvl::import_mvl_modpacks,
            // Waxlight Launcher (AmadoMuerte) instance import
            waxlight::detect_waxlight_instances,
            waxlight::import_waxlight_instances,
            // Cairn (cairns-gg) pack import
            cairn::detect_cairn_packs,
            cairn::import_cairn_packs,
            // Rustory (XurxoMF) instance import
            rustory::detect_rustory_instances,
            rustory::import_rustory_instances,
            // GruntLauncher (renarin-kholin) instance import
            gruntlauncher::detect_gruntlauncher_instances,
            gruntlauncher::import_gruntlauncher_instances,
            // Lithic (NotAShelf) instance import
            lithic::detect_lithic_instances,
            lithic::import_lithic_instances,
            // Yelloowstone (jgwoolley/vintage-story-launcher) instance import
            yelloowstone::detect_yelloowstone_instances,
            yelloowstone::import_yelloowstone_instances,
            // Servers
            servers::fetch_public_servers,
            servers::fetch_all_servers,
            // Sniffer
            sniffer::sniff_server,
            servers::add_server_to_profile,
            servers::remove_server_from_profile,
            servers::check_server_in_profile,
            servers::set_server_favorite,
            // Saves
            saves::get_profile_saves,
            saves::get_all_saves,
            saves::update_world,
            saves::remove_world,
            saves::duplicate_world,
            saves::backup_world,
            saves::import_world,
            // Screenshots
            screenshots::get_profile_screenshots,
            screenshots::get_screenshot_thumbnail,
            screenshots::read_screenshot,
            // Server Hosting
            server_hosting::create_hosted_server,
            server_hosting::get_all_hosted_servers,
            server_hosting::update_hosted_server,
            server_hosting::delete_hosted_server,
            server_hosting::start_hosted_server,
            server_hosting::stop_hosted_server,
            server_hosting::restart_hosted_server,
            server_hosting::send_server_command,
            server_hosting::get_server_status,
            server_hosting::get_server_logs,
            server_hosting::read_server_config,
            server_hosting::write_server_config,
            server_hosting::get_default_server_config,
            server_hosting::check_port_available,
            server_hosting::get_whitelist,
            server_hosting::add_to_whitelist,
            server_hosting::remove_from_whitelist,
            server_hosting::bulk_import_whitelist,
            server_hosting::lookup_player_uid,
            server_hosting::lookup_player_name,
            server_hosting::set_whitelist_mode,
            server_hosting::get_server_data_dir_size,
            // Maps
            maps::get_all_maps,
            maps::inspect_map_database,
            maps::get_map_bounds,
            maps::get_map_bounds_by_path,
            maps::get_map_tile,
            maps::get_all_map_tiles,
            maps::get_all_map_tiles_by_path,
        ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let RunEvent::Exit = event {
            server_hosting::kill_all_running_servers();
            download::pause_all_active_downloads();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_only_sizes_below_the_minimum() {
        let min = (900.0, 600.0);

        // Smaller than the minimum in both/one dimension: grown.
        assert_eq!(
            clamped_logical_size(tauri::LogicalSize::new(800.0, 500.0), min),
            Some(tauri::LogicalSize::new(900.0, 600.0))
        );
        assert_eq!(
            clamped_logical_size(tauri::LogicalSize::new(800.0, 900.0), min),
            Some(tauri::LogicalSize::new(900.0, 900.0))
        );

        // At or above the minimum: untouched.
        assert_eq!(
            clamped_logical_size(tauri::LogicalSize::new(900.0, 600.0), min),
            None
        );
        assert_eq!(
            clamped_logical_size(tauri::LogicalSize::new(1600.0, 1000.0), min),
            None
        );
    }

    #[test]
    fn requires_a_visible_area_on_a_monitor() {
        let monitor = (0.0, 0.0, 1920.0, 1080.0);

        // Fully inside, or partially inside with enough overlap.
        assert!(rects_overlap(
            (100.0, 100.0, 900.0, 600.0),
            monitor,
            100.0,
            100.0
        ));
        assert!(rects_overlap(
            (1870.0, 1030.0, 900.0, 600.0),
            monitor,
            40.0,
            40.0
        ));

        // A 1px intersection is technically "on screen" but unusable.
        assert!(!rects_overlap(
            (1919.0, 500.0, 900.0, 600.0),
            monitor,
            100.0,
            100.0
        ));
        // Saved coordinates of a monitor that is no longer connected.
        assert!(!rects_overlap(
            (2560.0, 200.0, 900.0, 600.0),
            monitor,
            100.0,
            100.0
        ));
    }
}
