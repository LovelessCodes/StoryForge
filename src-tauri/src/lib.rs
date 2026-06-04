mod modules;
use modules::{auth, download, installations, maps, mods, news, saves, servers, sniffer, versions};
use tauri::{WebviewUrl, WebviewWindowBuilder};

// ── Logging macros (crate root so accessible everywhere) ──

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("[StoryForge INFO] {msg}");
        $crate::modules::logger::log("INFO ", &msg);
    }};
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("[StoryForge DEBUG] {msg}");
        $crate::modules::logger::log("DEBUG", &msg);
    }};
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("[StoryForge ERROR] {msg}");
        $crate::modules::logger::log("ERROR", &msg);
    }};
}

use tauri::Manager;

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

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_handle = app.handle();

            // Init logger
            if let Ok(data_dir) = app_handle.path().app_data_dir() {
                modules::logger::init(&data_dir);
                log_info!("App started, data dir: {:?}", data_dir);
                // Also print to stderr so it's visible even if logger itself fails
                eprintln!("[StoryForge] App started, data dir: {:?}", data_dir);
            } else {
                eprintln!("[StoryForge] FATAL: Failed to resolve app_data_dir");
                panic!("Failed to resolve app_data_dir");
            }

            // ── Step 1: Create store directory ──
            log_info!("Setup step 1: creating store directory...");
            eprintln!("[StoryForge] Setup step 1: creating store directory...");
            let store_path = match app.path().app_data_dir() {
                Ok(dir) => dir.join("store"),
                Err(e) => {
                    log_error!("Failed to get app_data_dir for store: {}", e);
                    eprintln!(
                        "[StoryForge] FATAL: Failed to get app_data_dir for store: {}",
                        e
                    );
                    panic!("Failed to get app_data_dir for store: {}", e);
                }
            };
            if let Err(e) = std::fs::create_dir_all(&store_path) {
                log_error!("Failed to create store directory {:?}: {}", store_path, e);
                eprintln!(
                    "[StoryForge] FATAL: Failed to create store directory {:?}: {}",
                    store_path, e
                );
                panic!("Failed to create store directory: {}", e);
            }
            log_info!("Setup step 1 done: store dir created at {:?}", store_path);
            eprintln!("[StoryForge] Setup step 1 done.");

            // ── Step 2: Init zustand plugin ──
            log_info!("Setup step 2: initializing zustand plugin...");
            eprintln!("[StoryForge] Setup step 2: initializing zustand plugin...");
            app_handle
                .plugin(
                    tauri_plugin_zustand::Builder::new()
                        .path(store_path)
                        .build(),
                )
                .map_err(|e| {
                    log_error!("Failed to initialize zustand plugin: {}", e);
                    eprintln!(
                        "[StoryForge] FATAL: Failed to initialize zustand plugin: {}",
                        e
                    );
                    e
                })?;
            log_info!("Setup step 2 done: zustand plugin initialized");
            eprintln!("[StoryForge] Setup step 2 done.");

            // ── Step 3: Build main window ──
            log_info!("Setup step 3: building main window...");
            eprintln!("[StoryForge] Setup step 3: building main window...");

            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Story Forge")
                .inner_size(800.0, 600.0)
                .transparent(false);

            let window = match win_builder.build() {
                Ok(w) => {
                    log_info!("Setup step 3 done: window created");
                    eprintln!("[StoryForge] Setup step 3 done: window created");
                    w
                }
                Err(e) => {
                    log_error!("Failed to build main window: {}", e);
                    eprintln!("[StoryForge] FATAL: Failed to build main window: {}", e);
                    panic!("Failed to build main window: {}", e);
                }
            };

            // ── Step 4: Platform-specific window config ──
            log_info!(
                "Setup step 4: platform-specific window config (OS: {})",
                std::env::consts::OS
            );
            eprintln!(
                "[StoryForge] Setup step 4: platform-specific window config (OS: {})",
                std::env::consts::OS
            );

            #[cfg(target_os = "windows")]
            {
                let _ = window.set_decorations(false);
            }
            #[cfg(target_os = "macos")]
            {
                use objc2::rc::Retained;
                use objc2_app_kit::{NSColor, NSWindowStyleMask, NSWindowTitleVisibility};

                unsafe {
                    let ns_window: Retained<objc2_app_kit::NSWindow> =
                        Retained::retain(window.ns_window().unwrap() as *mut _).unwrap();

                    // Hide the title bar and traffic lights, keep resizable
                    ns_window.setTitlebarAppearsTransparent(true);
                    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
                    let mut mask = ns_window.styleMask();
                    mask.insert(NSWindowStyleMask::FullSizeContentView);
                    mask.insert(NSWindowStyleMask::Resizable);
                    mask.remove(NSWindowStyleMask::Titled);
                    ns_window.setStyleMask(mask);

                    // Rounded corners
                    if let Some(content_view) = ns_window.contentView() {
                        content_view.setWantsLayer(true);
                        content_view.layer().unwrap().setCornerRadius(12.0);
                        content_view.layer().unwrap().setMasksToBounds(true);
                    }

                    let bg_color = NSColor::colorWithRed_green_blue_alpha(
                        50.0 / 255.0,
                        158.0 / 255.0,
                        163.5 / 255.0,
                        0.0,
                    );
                    ns_window.setBackgroundColor(Some(&bg_color));
                }
            }
            log_info!("Setup step 4 done: platform-specific config applied");
            eprintln!("[StoryForge] Setup step 4 done.");

            // ── Step 5: Setup complete ──
            log_info!("Setup complete – app is running");
            eprintln!("[StoryForge] Setup complete – app is running");
            Ok(())
        })
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
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
            // Versions
            versions::fetch_versions,
            versions::get_installed_versions,
            versions::remove_installed_version,
            versions::move_versions_folder,
            versions::remove_all_versions,
            // Logger
            modules::logger::log_message,
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
            // Saves
            saves::get_installation_saves,
            saves::get_all_saves,
            saves::update_world,
            saves::remove_world,
            // Maps
            maps::get_all_maps,
            maps::inspect_map_database,
            maps::get_map_bounds,
            maps::get_map_bounds_by_path,
            maps::get_map_tile,
            maps::get_all_map_tiles,
            maps::get_all_map_tiles_by_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
