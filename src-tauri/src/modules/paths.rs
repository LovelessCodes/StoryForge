//! Vintage Story file and directory path constants and helpers.
// Allow dead code while this module is being adopted across the codebase.
#![allow(dead_code)]
//!
//! This module centralizes names and path-building helpers for Vintage Story
//! installations, saves, mods, maps, and server files. Keeping them in one place
//! removes magic strings from the rest of the codebase and makes cross-platform
//! differences explicit.

use std::path::{Path, PathBuf};

/// Base name of the Vintage Story executable on Unix.
pub const VINTAGESTORY_EXE_UNIX: &str = "vintagestory";

/// Base name of the Vintage Story executable on Windows.
pub const VINTAGESTORY_EXE_WINDOWS: &str = "vintagestory.exe";

/// Returns the base executable name for the current platform.
pub fn vintagestory_exe() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        VINTAGESTORY_EXE_WINDOWS
    }
    #[cfg(not(target_os = "windows"))]
    {
        VINTAGESTORY_EXE_UNIX
    }
}

/// File name for per-installation metadata persisted by StoryForge.
pub const INSTALLATION_JSON: &str = "installation.json";

/// Vintage Story client settings file.
pub const CLIENTSETTINGS_JSON: &str = "clientsettings.json";

/// Vintage Story server configuration file.
pub const SERVERCONFIG_JSON: &str = "serverconfig.json";

/// Directory inside an installation that holds mods.
pub const MODS_DIR: &str = "Mods";

/// Directory inside an installation that holds saves/worlds.
pub const SAVES_DIR: &str = "Saves";

/// Directory inside an installation that holds map databases.
pub const MAPS_DIR: &str = "Maps";

/// File extension for Vintage Story save/world databases.
pub const SAVE_EXTENSION: &str = ".vcdbs";

/// SQLite table that holds the protobuf `GameData` blob in save/map databases.
pub const GAMEDATA_TABLE: &str = "gamedata";

/// Column in `gamedata` that holds the protobuf bytes.
pub const GAMEDATA_DATA_COLUMN: &str = "data";

/// Subdirectory inside the app data dir where versions are stored by default.
pub const DEFAULT_VERSIONS_SUBDIR: &str = "versions";

/// Subdirectory inside the app data dir where installations are stored by default.
pub const DEFAULT_INSTALLATIONS_SUBDIR: &str = "installations";

/// Default name of the zustand store file/directory.
pub const STORE_DIR: &str = "store";

/// Returns the path to an installation's `Mods` directory.
pub fn mods_dir<P: AsRef<Path>>(installation: P) -> PathBuf {
    installation.as_ref().join(MODS_DIR)
}

/// Returns the path to an installation's `Saves` directory.
pub fn saves_dir<P: AsRef<Path>>(installation: P) -> PathBuf {
    installation.as_ref().join(SAVES_DIR)
}

/// Returns the path to an installation's `Maps` directory.
pub fn maps_dir<P: AsRef<Path>>(installation: P) -> PathBuf {
    installation.as_ref().join(MAPS_DIR)
}

/// Returns the path to an installation's `clientsettings.json`.
pub fn clientsettings_path<P: AsRef<Path>>(installation: P) -> PathBuf {
    installation.as_ref().join(CLIENTSETTINGS_JSON)
}

/// Returns the path to an installation's `installation.json`.
pub fn installation_json_path<P: AsRef<Path>>(installation: P) -> PathBuf {
    installation.as_ref().join(INSTALLATION_JSON)
}

/// Returns the path to a world/save `.vcdbs` file inside an installation.
pub fn save_path<P: AsRef<Path>, S: AsRef<str>>(installation: P, world_name: S) -> PathBuf {
    installation
        .as_ref()
        .join(SAVES_DIR)
        .join(format!("{}{}", world_name.as_ref(), SAVE_EXTENSION))
}

/// Returns the path to a map database for a given world identifier.
pub fn map_db_path<P: AsRef<Path>, S: AsRef<str>>(installation: P, world_id: S) -> PathBuf {
    installation
        .as_ref()
        .join(MAPS_DIR)
        .join(format!("{}.db", world_id.as_ref()))
}

/// Returns the path to a server's `serverconfig.json`.
pub fn serverconfig_path<P: AsRef<Path>>(server_data_dir: P) -> PathBuf {
    server_data_dir.as_ref().join(SERVERCONFIG_JSON)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_vintagestory_exe_platform() {
        #[cfg(target_os = "windows")]
        assert_eq!(vintagestory_exe(), VINTAGESTORY_EXE_WINDOWS);
        #[cfg(not(target_os = "windows"))]
        assert_eq!(vintagestory_exe(), VINTAGESTORY_EXE_UNIX);
    }

    #[test]
    fn test_path_builders() {
        let inst = PathBuf::from("/game/MyWorld");
        assert_eq!(mods_dir(&inst), PathBuf::from("/game/MyWorld/Mods"));
        assert_eq!(saves_dir(&inst), PathBuf::from("/game/MyWorld/Saves"));
        assert_eq!(maps_dir(&inst), PathBuf::from("/game/MyWorld/Maps"));
        assert_eq!(
            clientsettings_path(&inst),
            PathBuf::from("/game/MyWorld/clientsettings.json")
        );
        assert_eq!(
            save_path(&inst, "world1"),
            PathBuf::from("/game/MyWorld/Saves/world1.vcdbs")
        );
        assert_eq!(
            map_db_path(&inst, "abc123"),
            PathBuf::from("/game/MyWorld/Maps/abc123.db")
        );
    }
}
