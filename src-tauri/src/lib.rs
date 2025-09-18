mod modules;
use modules::{auth, download, installations, mods, news, servers, versions};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_zustand::init())
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
