mod modules;
use modules::{auth, download, installations, maps, mods, news, saves, servers, sniffer, versions};
use tauri::{WebviewUrl, WebviewWindowBuilder};

// ── Logging macros (crate root so accessible everywhere) ──

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {{
        $crate::modules::logger::log("INFO ", &format!($($arg)*));
    }};
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {{
        $crate::modules::logger::log("DEBUG", &format!($($arg)*));
    }};
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {{
        $crate::modules::logger::log("ERROR", &format!($($arg)*));
    }};
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            }

            let store_path = app.path().app_data_dir().unwrap().join("store");
            std::fs::create_dir_all(&store_path).unwrap();
            app_handle
                .plugin(
                    tauri_plugin_zustand::Builder::new()
                        .path(store_path)
                        .build(),
                )
                .map_err(|e| {
                    log_error!("Failed to initialize zustand plugin: {}", e);
                    e
                })?;

            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Story Forge")
                .inner_size(800.0, 600.0);

            let window = win_builder.build().unwrap();

            // set background color only when building for macOS
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
            modules::logger::get_logs,
            // Installations
            installations::get_all_installations,
            installations::save_installation,
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
