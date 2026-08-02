pub mod modules;
use modules::{
    auth, download, installations, maps, mods, news, saves, server_hosting, servers, sniffer,
    versions,
};
use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

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

use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

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
                Ok(dir) => dir.join("store"),
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

            // ── Step 2.5: Run data migrations ──
            log_info!("Setup step 2.5: running data migrations...");
            let t2_5 = std::time::Instant::now();
            modules::migrations::run_all(&app_handle);
            log_info!("Setup step 2.5 done: migrations complete");
            modules::logger::log_elapsed("Setup step 2.5 elapsed", t2_5);

            // ── Step 2.75: Shared HTTP client ──
            log_info!("Setup step 2.75: initializing shared HTTP client...");
            let t2_75 = std::time::Instant::now();
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
            log_info!("Setup step 2.75 done: shared HTTP client ready");
            modules::logger::log_elapsed("Setup step 2.75 elapsed", t2_75);

            // ── Step 3: Build main window ──
            log_info!("Setup step 3: building main window...");
            let t3 = std::time::Instant::now();

            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Story Forge")
                .inner_size(800.0, 600.0)
                .transparent(cfg!(target_os = "macos"))
                .decorations(!cfg!(target_os = "linux"));

            let window = match win_builder.build() {
                Ok(w) => {
                    log_info!("Setup step 3 done: window created");
                    w
                }
                Err(e) => {
                    log_error!("Failed to build main window: {}", e);
                    panic!("Failed to build main window: {}", e);
                }
            };

            modules::logger::log_elapsed("Setup step 3 elapsed", t3);

            // ── Step 4: Platform-specific window config ──
            log_info!(
                "Setup step 4: platform-specific window config (OS: {})",
                std::env::consts::OS
            );
            let t4 = std::time::Instant::now();

            #[cfg(target_os = "macos")]
            {
                modules::platform::macos::apply_window_styling(&window);
            }
            log_info!("Setup step 4 done: platform-specific config applied");
            modules::logger::log_elapsed("Setup step 4 elapsed", t4);

            // ── Step 5: Setup complete ──
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
            // News
            news::fetch_news,
            // Mods
            mods::fetch_mod_tags,
            mods::fetch_mods,
            mods::fetch_mod_info,
            mods::fetch_authors,
            mods::get_mods,
            mods::get_mod_configs,
            mods::get_mod_updates,
            mods::get_installation_mods,
            mods::add_mod_to_installation,
            mods::download_mod,
            mods::remove_mod_from_installation,
            mods::save_mod_config,
            // Download
            download::get_download_links,
            download::get_download_link,
            download::download_and_maybe_extract,
            download::scan_resume_manifests,
            // Versions
            versions::fetch_versions,
            versions::get_installed_versions,
            versions::remove_installed_version,
            versions::move_versions_folder,
            versions::remove_all_versions,
            // Logger
            modules::logger::log_message,
            modules::logger::log_startup_time,
            modules::logger::log_webview_gap,
            modules::logger::get_logs,
            // Installations
            installations::get_all_installations,
            installations::save_installation,
            installations::import_installation,
            installations::play_game,
            installations::confirm_vintage_story_exe,
            installations::initialize_game,
            installations::reveal_in_file_explorer,
            installations::remove_installation,
            installations::move_installations_folder,
            installations::remove_all_installations,
            installations::rename_installations_folder,
            installations::get_installation_logs,
            installations::read_installation_log,
            installations::zip_modconfig,
            // Servers
            servers::fetch_public_servers,
            servers::fetch_all_servers,
            // Sniffer
            sniffer::sniff_server,
            servers::add_server_to_installation,
            servers::remove_server_from_installation,
            servers::check_server_in_installation,
            servers::set_server_favorite,
            // Saves
            saves::get_installation_saves,
            saves::get_all_saves,
            saves::update_world,
            saves::remove_world,
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
