//! Detecting content that more than one installed mod provides or patches.
//!
//! Two kinds of overlap matter in Vintage Story:
//!
//! - **Assets**: two mods ship the same file under `assets/…` (a texture, a
//!   shape, a lang file). The game resolves each path to one file; the other
//!   mod silently loses.
//! - **Patches**: two mods patch the same JSON asset (`patches/*.json`, the
//!   `file` + `path` pair of a patch operation). Overlapping JSON pointers can
//!   stomp on each other; disjoint pointers in the same file are fine.
//!
//! The scan only lists the zip's central directory for assets (no
//! decompression) and reads patch files (small) to compare their targets. It is
//! intentionally informational: overlapping content is sometimes deliberate, so
//! nothing is blocked or removed.

use std::{
    collections::{BTreeMap, HashMap},
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;
use tauri::{command, AppHandle};
use zip::ZipArchive;

use super::errors::UiError;
use super::utils::require_managed_path;
use super::{mods, paths};
use crate::log_info;

/// Cap on reported conflicts; a huge mod folder should not produce an
/// unbounded payload.
const MAX_CONFLICTS: usize = 200;
/// Skip patch files larger than this instead of reading them.
const MAX_PATCH_BYTES: u64 = 1024 * 1024;
/// Cap on how many overlapping pointers are named per patch conflict.
const MAX_DETAIL_PATHS: usize = 3;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictMod {
    pub modid: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModConflict {
    /// `asset` or `patch`.
    pub kind: String,
    /// The asset path, or the patched JSON file for a patch conflict.
    pub path: String,
    /// For patch conflicts: the overlapping JSON pointers.
    pub detail: Option<String>,
    pub mods: Vec<ConflictMod>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
    pub conflicts: Vec<ModConflict>,
    /// Installed mods that took part in the scan.
    pub scanned: u32,
    /// True when the report was cut off at [`MAX_CONFLICTS`].
    pub truncated: bool,
}

/// The `(file, path)` pairs every operation in a patch document names.
fn read_patch_targets(value: &Value) -> Vec<(String, String)> {
    match value {
        Value::Array(items) => items.iter().flat_map(read_patch_targets).collect(),
        Value::Object(map) => {
            let file = map
                .get("file")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim();
            if file.is_empty() {
                return Vec::new();
            }
            let path = map
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            vec![(file.to_string(), path)]
        }
        _ => Vec::new(),
    }
}

fn pointer_segments(path: &str) -> Vec<&str> {
    path.split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

/// True when two JSON pointers touch the same place: equal, or one is a
/// prefix of the other (a patch higher up the tree rewrites the whole subtree).
fn pointers_overlap(a: &[&str], b: &[&str]) -> bool {
    let shared = a.len().min(b.len());
    a[..shared] == b[..shared]
}

/// Distinct *mods* (by modid), not distinct zips: two copies of the same
/// modid are a duplicate-install problem, not a conflict between mods.
fn distinct_mods(installed: &[mods::OutputMod], indices: &[usize]) -> Vec<usize> {
    let mut seen = std::collections::HashSet::new();
    indices
        .iter()
        .copied()
        .filter(|index| {
            installed
                .get(*index)
                .map(|item| seen.insert(item.modid.to_lowercase()))
                .unwrap_or(false)
        })
        .collect()
}

fn conflict_mods(installed: &[mods::OutputMod], indices: &[usize]) -> Vec<ConflictMod> {
    indices
        .iter()
        .filter_map(|index| installed.get(*index))
        .map(|item| ConflictMod {
            modid: item.modid.clone(),
            name: item.name.clone(),
            version: item.version.clone(),
        })
        .collect()
}

/// Scans a profile's installed mods for overlapping assets and patch targets.
pub(crate) fn scan_conflicts(profile_dir: &Path) -> Result<ConflictReport, UiError> {
    let mods_dir = paths::mods_dir(profile_dir);
    let installed = if mods_dir.is_dir() {
        mods::get_mods_in_dir(&mods_dir)?.mods
    } else {
        Vec::new()
    };

    // Asset path -> indices of the mods shipping it.
    let mut assets: HashMap<String, Vec<usize>> = HashMap::new();
    // Patched JSON file -> (mod index, JSON pointer) of every operation.
    let mut patches: HashMap<String, Vec<(usize, String)>> = HashMap::new();

    for (index, installed_mod) in installed.iter().enumerate() {
        let path = PathBuf::from(&installed_mod.path);
        let Ok(file) = File::open(&path) else {
            continue;
        };
        let Ok(mut archive) = ZipArchive::new(file) else {
            continue;
        };
        for entry_index in 0..archive.len() {
            let Ok(mut entry) = archive.by_index(entry_index) else {
                continue;
            };
            if entry.is_dir() {
                continue;
            }
            let name = entry.name().to_string();
            if name.starts_with("__MACOSX/") || name.ends_with("modinfo.json") {
                continue;
            }
            if name.starts_with("assets/") {
                assets.entry(name).or_default().push(index);
                continue;
            }
            if name.starts_with("patches/") && name.ends_with(".json") {
                if entry.size() > MAX_PATCH_BYTES {
                    continue;
                }
                let mut contents = String::new();
                if entry.read_to_string(&mut contents).is_err() {
                    continue;
                }
                let Ok(document) = json5::from_str::<Value>(&contents) else {
                    continue;
                };
                for (file, pointer) in read_patch_targets(&document) {
                    patches.entry(file).or_default().push((index, pointer));
                }
            }
        }
    }

    let mut conflicts = Vec::new();
    let mut truncated = false;

    // Asset overlaps, sorted for a stable report.
    let mut asset_paths: Vec<&String> = assets.keys().collect();
    asset_paths.sort();
    for asset in asset_paths {
        let indices = distinct_mods(&installed, &assets[asset]);
        if indices.len() < 2 {
            continue;
        }
        conflicts.push(ModConflict {
            kind: "asset".to_string(),
            path: asset.clone(),
            detail: None,
            mods: conflict_mods(&installed, &indices),
        });
        if conflicts.len() >= MAX_CONFLICTS {
            truncated = true;
            break;
        }
    }

    // Patch overlaps.
    if !truncated {
        let mut targets: Vec<&String> = patches.keys().collect();
        targets.sort();
        'targets: for target in targets {
            let entries = &patches[target];
            let entry_indices: Vec<usize> = entries.iter().map(|(index, _)| *index).collect();
            if distinct_mods(&installed, &entry_indices).len() < 2 {
                continue;
            }
            let mut overlapping: BTreeMap<String, Vec<usize>> = BTreeMap::new();
            for (a, (a_mod, a_path)) in entries.iter().enumerate() {
                let a_segments = pointer_segments(a_path);
                for (b_mod, b_path) in entries.iter().skip(a + 1) {
                    if a_mod == b_mod {
                        continue;
                    }
                    if pointers_overlap(&a_segments, &pointer_segments(b_path)) {
                        overlapping.entry(a_path.clone()).or_default().push(*a_mod);
                        overlapping.entry(b_path.clone()).or_default().push(*b_mod);
                    }
                }
            }
            if overlapping.is_empty() {
                continue;
            }
            let detail = overlapping
                .keys()
                .take(MAX_DETAIL_PATHS)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ");
            let mut involved: Vec<usize> = overlapping.values().flatten().copied().collect();
            involved.sort_unstable();
            conflicts.push(ModConflict {
                kind: "patch".to_string(),
                path: target.clone(),
                detail: Some(detail),
                mods: conflict_mods(&installed, &distinct_mods(&installed, &involved)),
            });
            if conflicts.len() >= MAX_CONFLICTS {
                truncated = true;
                break 'targets;
            }
        }
    }

    Ok(ConflictReport {
        scanned: installed.len() as u32,
        conflicts,
        truncated,
    })
}

/// Reports overlapping content between a profile's installed mods.
#[command]
pub async fn scan_mod_conflicts(app: AppHandle, path: String) -> Result<ConflictReport, UiError> {
    log_info!("scan_mod_conflicts: {}", path);
    require_managed_path(&app, Path::new(&path), "Profile path")?;
    tokio::task::spawn_blocking(move || scan_conflicts(Path::new(&path)))
        .await
        .map_err(|error| UiError::new("internal_error", format!("Conflict scan failed: {error}")))?
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn modinfo(modid: &str) -> String {
        serde_json::json!({
            "modid": modid,
            "name": format!("Mod {modid}"),
            "version": "1.0.0",
            "type": "code",
            "side": "universal",
        })
        .to_string()
    }

    fn write_mod_zip(path: &Path, modid: &str, entries: &[(&str, &str)]) {
        let file = File::create(path).unwrap();
        let mut writer = ZipWriter::new(file);
        writer
            .start_file("modinfo.json", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(modinfo(modid).as_bytes()).unwrap();
        for (name, contents) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(contents.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    fn profile() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(paths::mods_dir(dir.path())).unwrap();
        dir
    }

    #[test]
    fn finds_overlapping_assets_across_mods() {
        let dir = profile();
        let mods_dir = paths::mods_dir(dir.path());
        write_mod_zip(
            &mods_dir.join("a.zip"),
            "a",
            &[("assets/game/textures/block/stone.png", "a")],
        );
        write_mod_zip(
            &mods_dir.join("b.zip"),
            "b",
            &[
                ("assets/game/textures/block/stone.png", "b"),
                ("assets/game/shapes/unique.json", "{}"),
            ],
        );
        write_mod_zip(
            &mods_dir.join("c.zip"),
            "c",
            &[("assets/game/shapes/other.json", "{}")],
        );

        let report = scan_conflicts(dir.path()).unwrap();
        assert_eq!(report.scanned, 3);
        assert_eq!(report.conflicts.len(), 1);
        let conflict = &report.conflicts[0];
        assert_eq!(conflict.kind, "asset");
        assert_eq!(conflict.path, "assets/game/textures/block/stone.png");
        assert_eq!(conflict.mods.len(), 2);
        let ids: Vec<&str> = conflict.mods.iter().map(|m| m.modid.as_str()).collect();
        assert!(ids.contains(&"a") && ids.contains(&"b"));
    }

    #[test]
    fn overlapping_assets_within_one_modid_are_not_reported() {
        // Two zips of the same modid (a duplicate install) are a different
        // problem; conflict detection only reports distinct mods.
        let dir = profile();
        let mods_dir = paths::mods_dir(dir.path());
        write_mod_zip(
            &mods_dir.join("a-1.0.0.zip"),
            "a",
            &[("assets/game/tex.png", "1")],
        );
        write_mod_zip(
            &mods_dir.join("a-1.0.1.zip"),
            "a",
            &[("assets/game/tex.png", "2")],
        );
        let report = scan_conflicts(dir.path()).unwrap();
        assert!(report.conflicts.is_empty());
    }

    #[test]
    fn finds_overlapping_patch_targets() {
        let dir = profile();
        let mods_dir = paths::mods_dir(dir.path());
        write_mod_zip(
            &mods_dir.join("a.zip"),
            "a",
            &[(
                "patches/patch.json",
                r#"[{"file":"game:blocktypes/stone","path":"/textures/all/stone","op":"add"}]"#,
            )],
        );
        write_mod_zip(
            &mods_dir.join("b.zip"),
            "b",
            &[(
                "patches/patch.json",
                r#"[{"file":"game:blocktypes/stone","path":"/textures/all/stone","op":"replace"}]"#,
            )],
        );
        let report = scan_conflicts(dir.path()).unwrap();
        assert_eq!(report.conflicts.len(), 1);
        assert_eq!(report.conflicts[0].kind, "patch");
        assert_eq!(report.conflicts[0].path, "game:blocktypes/stone");
        assert_eq!(
            report.conflicts[0].detail.as_deref(),
            Some("/textures/all/stone")
        );
        assert_eq!(report.conflicts[0].mods.len(), 2);
    }

    #[test]
    fn prefix_overlap_counts_but_disjoint_paths_do_not() {
        let dir = profile();
        let mods_dir = paths::mods_dir(dir.path());
        // A replaces a whole subtree; B touches a leaf inside it.
        write_mod_zip(
            &mods_dir.join("a.zip"),
            "a",
            &[(
                "patches/patch.json",
                r#"[{"file":"game:itemtypes/tool","path":"/attributes","op":"replace"}]"#,
            )],
        );
        write_mod_zip(
            &mods_dir.join("b.zip"),
            "b",
            &[(
                "patches/patch.json",
                r#"[{"file":"game:itemtypes/tool","path":"/attributes/durability","op":"add"}]"#,
            )],
        );
        write_mod_zip(
            &mods_dir.join("c.zip"),
            "c",
            &[(
                "patches/patch.json",
                r#"[{"file":"game:itemtypes/tool","path":"/textures/other","op":"add"}]"#,
            )],
        );

        let report = scan_conflicts(dir.path()).unwrap();
        assert_eq!(report.conflicts.len(), 1);
        assert_eq!(report.conflicts[0].mods.len(), 2);
        let ids: Vec<&str> = report.conflicts[0]
            .mods
            .iter()
            .map(|m| m.modid.as_str())
            .collect();
        assert!(ids.contains(&"a") && ids.contains(&"b"));
        assert!(!ids.contains(&"c"));
    }

    #[test]
    fn ignores_macos_metadata_entries() {
        let dir = profile();
        let mods_dir = paths::mods_dir(dir.path());
        write_mod_zip(
            &mods_dir.join("a.zip"),
            "a",
            &[("__MACOSX/assets/game/tex.png", "x")],
        );
        write_mod_zip(
            &mods_dir.join("b.zip"),
            "b",
            &[("__MACOSX/assets/game/tex.png", "y")],
        );
        let report = scan_conflicts(dir.path()).unwrap();
        assert!(report.conflicts.is_empty());
    }
}
