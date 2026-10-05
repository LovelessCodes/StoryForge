//! Import and export of RiftLauncher-compatible modpack manifests.
//!
//! A pack is a small JSON document, not an archive: a name, the game version
//! the pack targets, and one line per mod with the exact version the pack was
//! exported from. Importing resolves every line on the ModDB and installs the
//! matching release, so the file itself stays tiny and portable.
//!
//! RiftLauncher (the continuation of VS Launcher) writes this shape from its
//! "Export Modpack" dialog and reads it back on import; MVL packs are folders
//! and carry no manifest, so this is the only cross-launcher pack format in
//! circulation:
//!
//! ```json
//! {
//!   "name": "Anego Server",
//!   "gameVersion": "1.21.3",
//!   "mods": [{ "modid": "carryon", "version": "1.13.0", "name": "Carry On" }]
//! }
//! ```
//!
//! RiftLauncher also writes optional `servers` and `settings` blocks, ignored
//! here: unknown fields are skipped so a stranger's pack imports as-is.

use std::{collections::HashSet, fs};

use serde::{Deserialize, Serialize};
use tauri::command;

use super::errors::UiError;
use crate::log_info;

/// Refuse a manifest larger than this before parsing. Real packs are kilobytes.
const MAX_MANIFEST_BYTES: u64 = 8 * 1024 * 1024;
/// Refuse more entries than any sane pack carries.
const MAX_MANIFEST_ENTRIES: usize = 2000;
/// Display-only names are clamped (modinfo.json names can run to 4k chars).
const MAX_DISPLAY_NAME: usize = 256;
const MAX_GAME_VERSION: usize = 128;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModpackManifestMod {
    pub modid: String,
    pub version: String,
    /// Display name of the copy the pack was exported from; never an identifier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackManifest {
    pub name: String,
    pub game_version: String,
    pub mods: Vec<ModpackManifestMod>,
}

/// Clamp to `max` characters without splitting a multi-byte char.
fn clamp(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    value.chars().take(max).collect()
}

fn invalid(message: impl Into<String>) -> UiError {
    UiError::new("invalid_manifest", message)
}

impl ModpackManifest {
    /// Normalize display-only fields and refuse a manifest that cannot describe
    /// a real install. Deliberately tolerant: only what an import would act on
    /// is an error.
    fn validate(mut self) -> Result<Self, UiError> {
        self.name = clamp(self.name.trim(), MAX_DISPLAY_NAME);
        self.game_version = clamp(self.game_version.trim(), MAX_GAME_VERSION);
        if self.mods.len() > MAX_MANIFEST_ENTRIES {
            return Err(invalid(format!(
                "Modpack lists {} mods; the limit is {MAX_MANIFEST_ENTRIES}",
                self.mods.len()
            )));
        }
        for entry in &mut self.mods {
            entry.modid = entry.modid.trim().to_string();
            entry.version = entry.version.trim().to_string();
            if entry.modid.is_empty() || entry.version.is_empty() {
                return Err(invalid("Modpack has an entry without a mod id or version"));
            }
            entry.name = entry
                .name
                .take()
                .map(|name| clamp(name.trim(), MAX_DISPLAY_NAME))
                .filter(|name| !name.is_empty());
        }
        // A pack names each mod at most once. A duplicate would install twice
        // and could leave two zips for the same modid in the profile; the first
        // occurrence wins so manifest order is kept.
        let mut seen = HashSet::new();
        self.mods
            .retain(|entry| seen.insert(entry.modid.to_lowercase()));
        Ok(self)
    }
}

/// Read a modpack manifest from a user-selected file.
#[command]
pub fn read_modpack_manifest(path: String) -> Result<ModpackManifest, UiError> {
    log_info!("read_modpack_manifest");
    let size = fs::metadata(&path)
        .map_err(|e| invalid(format!("Could not open the modpack file: {e}")))?
        .len();
    if size > MAX_MANIFEST_BYTES {
        return Err(invalid("The modpack file is too large"));
    }
    let text = fs::read_to_string(&path)
        .map_err(|e| invalid(format!("Could not read the modpack file: {e}")))?;
    let manifest: ModpackManifest = serde_json::from_str(&text)
        .map_err(|e| invalid(format!("Not a valid modpack manifest: {e}")))?;
    manifest.validate()
}

/// Write a modpack manifest to a user-selected file.
#[command]
pub fn write_modpack_manifest(path: String, manifest: ModpackManifest) -> Result<(), UiError> {
    log_info!("write_modpack_manifest");
    let manifest = manifest.validate()?;
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|e| invalid(format!("Could not serialize the modpack: {e}")))?;
    if text.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(invalid("The modpack is too large to write"));
    }
    fs::write(&path, text)
        .map_err(|e| UiError::new("io_error", format!("Could not write the modpack file: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(value: serde_json::Value) -> Result<ModpackManifest, UiError> {
        let manifest: ModpackManifest = serde_json::from_value(value)
            .map_err(|e| invalid(format!("Not a valid modpack manifest: {e}")))?;
        manifest.validate()
    }

    #[test]
    fn ignores_foreign_fields_and_clamps_long_names() {
        let long_name = "n".repeat(MAX_DISPLAY_NAME + 50);
        let manifest = parse(serde_json::json!({
            "name": "  Anego Server  ",
            "gameVersion": "1.21.3",
            // RiftLauncher's optional blocks and anything else unknown.
            "servers": [{ "name": "s", "ip": "1.2.3.4" }],
            "settings": { "some": "config" },
            "mods": [{ "modid": "carryon", "version": "1.13.0", "name": long_name }],
        }))
        .unwrap();

        assert_eq!(manifest.name, "Anego Server");
        assert_eq!(manifest.game_version, "1.21.3");
        assert_eq!(manifest.mods.len(), 1);
        let entry = &manifest.mods[0];
        assert_eq!(entry.modid, "carryon");
        assert_eq!(entry.version, "1.13.0");
        assert_eq!(
            entry.name.as_deref().map(|name| name.chars().count()),
            Some(MAX_DISPLAY_NAME)
        );
    }

    #[test]
    fn rejects_entries_without_a_mod_id_or_version() {
        assert!(parse(serde_json::json!({
            "name": "Pack",
            "gameVersion": "1.21.3",
            "mods": [{ "modid": "  ", "version": "1.0.0" }],
        }))
        .is_err());
        assert!(parse(serde_json::json!({
            "name": "Pack",
            "gameVersion": "1.21.3",
            "mods": [{ "modid": "carryon", "version": "" }],
        }))
        .is_err());
        assert!(parse(serde_json::json!({
            "name": "Pack",
            "gameVersion": "1.21.3",
        }))
        .is_err());
    }

    #[test]
    fn deduplicates_repeated_modids_keeping_the_first() {
        let manifest = parse(serde_json::json!({
            "name": "Pack",
            "gameVersion": "1.21.3",
            "mods": [
                { "modid": "carryon", "version": "1.0.0" },
                { "modid": "CarryOn", "version": "2.0.0" },
                { "modid": "xlib", "version": "0.9.0" },
            ],
        }))
        .unwrap();

        assert_eq!(manifest.mods.len(), 2);
        assert_eq!(manifest.mods[0].modid, "carryon");
        assert_eq!(manifest.mods[0].version, "1.0.0");
        assert_eq!(manifest.mods[1].modid, "xlib");
    }

    #[test]
    fn rejects_an_oversized_pack() {
        let mods: Vec<_> = (0..=MAX_MANIFEST_ENTRIES)
            .map(|index| serde_json::json!({ "modid": format!("mod{index}"), "version": "1.0.0" }))
            .collect();
        assert!(parse(serde_json::json!({
            "name": "Pack",
            "gameVersion": "1.21.3",
            "mods": mods,
        }))
        .is_err());
    }

    #[test]
    fn read_and_write_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        // The export path clamps the display name; allow a nested name here so
        // the fallback for empty names is covered too.
        let manifest = ModpackManifest {
            name: "My Pack".into(),
            game_version: "1.22.5".into(),
            mods: vec![
                ModpackManifestMod {
                    modid: "carryon".into(),
                    version: "1.13.0".into(),
                    name: Some("Carry On".into()),
                },
                ModpackManifestMod {
                    modid: "xlib".into(),
                    version: "0.9.0".into(),
                    name: None,
                },
            ],
        };
        let path = dir.path().join("pack.json");
        write_modpack_manifest(path.to_string_lossy().into(), manifest.clone()).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        // camelCase on the wire, and no `name` key for an unnamed mod.
        assert!(raw.contains("\"gameVersion\""));
        assert!(!raw.contains("\"name\": null"));

        let read = read_modpack_manifest(path.to_string_lossy().into()).unwrap();
        assert_eq!(read, manifest);
    }

    #[test]
    fn read_refuses_garbage_and_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let garbage = dir.path().join("garbage.json");
        fs::write(&garbage, "not json").unwrap();
        assert!(read_modpack_manifest(garbage.to_string_lossy().into()).is_err());
        assert!(
            read_modpack_manifest(dir.path().join("nope.json").to_string_lossy().into()).is_err()
        );
    }
}
