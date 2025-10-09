mod modules;
use modules::{auth, download, installations, mods, news, saves, servers, versions};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let app_handle = app.handle();
            let store_path = app.path().app_data_dir().unwrap().join("store");
            std::fs::create_dir_all(&store_path).unwrap();
            app_handle
                .plugin(
                    tauri_plugin_zustand::Builder::new()
                        .path(store_path)
                        .build(),
                )
                .map_err(|e| {
                    eprintln!("Failed to initialize zustand plugin: {}", e);
                    e
                })?;
            Ok(())
        })
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            // Authorization
            auth::login,
            auth::verify,
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
            // Installations
            installations::play_game,
            installations::confirm_vintage_story_exe,
            installations::initialize_game,
            installations::reveal_in_file_explorer,
            installations::remove_installation,
            // Servers
            servers::fetch_public_servers,
            servers::fetch_all_servers,
            servers::add_server_to_installation,
            servers::remove_server_from_installation,
            servers::check_server_in_installation,
            // Saves
            saves::get_installation_saves,
            saves::get_all_saves,
            saves::update_world,
            saves::remove_world,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
