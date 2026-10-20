//! Centralised, content-addressed store for mod zips.
//!
//! Profile `Mods` directories keep ordinary-looking `<name>.zip` files, but the
//! bytes live once under `<profiles-parent>/mods-store/blobs/<sha256>/…` and
//! are hardlinked into every profile that uses them. Hardlinks need the store
//! and the profile to sit on the same filesystem; when that is not possible
//! (external profiles, FAT/exFAT drives, network shares) installs fall back to
//! a normal copy.
//!
//! The store is intentionally not the source of truth for what a profile has.
//! Deleting a blob never removes a profile's file: the profile link keeps the
//! inode alive. The index is a cache for filenames/mod metadata and can be
//! rebuilt; correctness only depends on the blobs and profile links.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, create_dir_all, read_dir, File},
    io::Read,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{command, AppHandle};
use tauri_plugin_zustand::ManagerExt;
use uuid::Uuid;

use super::errors::UiError;
use super::utils::{
    dir_name, format_size, generate_id, lock, profiles_folder, profiles_subdir, safe_file_name,
};
use super::{paths, profile_ops, profiles, server_hosting};
use crate::{log_error, log_info};

const INDEX_FILE: &str = "index.json";
const BLOBS_DIR: &str = "blobs";
const TMP_DIR: &str = "tmp";
const INDEX_VERSION: u32 = 1;
/// Blob names are cosmetic (the directory is the hash). Keep paths short
/// enough for Windows' traditional 260-character limit.
const MAX_BLOB_NAME: usize = 80;

static INDEX_LOCK: LazyLock<Mutex<()>> = LazyLock::new(Default::default);
static INGEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(Default::default);
static USABLE_CACHE: LazyLock<Mutex<HashMap<(PathBuf, PathBuf), bool>>> =
    LazyLock::new(Default::default);
/// Serialises profile-file finalisation with explicit store optimization.
///
/// A store operation hashes a profile file and later replaces its directory
/// entry. Without this lock a concurrent delete/install can land between those
/// steps, and the optimizer would put the old file back.
static MOD_MUTATION_LOCK: LazyLock<Mutex<()>> = LazyLock::new(Default::default);

#[derive(Debug, Clone)]
pub struct ModStore {
    root: PathBuf,
}

#[derive(Debug, Clone, Default)]
pub struct BlobMeta {
    pub modid: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBlob {
    pub hash: String,
    pub path: String,
    pub filename: String,
    pub size: u64,
    pub modid: Option<String>,
    pub mod_version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Ingested {
    pub blob: StoredBlob,
    /// False when the same bytes were already in the store.
    pub created: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkMode {
    Hardlink,
    Copy,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreStats {
    pub enabled: bool,
    pub path: String,
    pub blob_count: usize,
    pub total_bytes: u64,
    pub total_display: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeReport {
    pub disabled: bool,
    pub profiles: usize,
    pub files: usize,
    pub linked: usize,
    pub already_linked: usize,
    pub copied: usize,
    pub skipped: usize,
    pub failed: usize,
    pub reclaimed_bytes: u64,
    pub reclaimed_display: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ProfileOptimize {
    pub files: usize,
    pub linked: usize,
    pub already_linked: usize,
    pub copied: usize,
    pub skipped: usize,
    pub failed: usize,
    pub reclaimed_bytes: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PruneReport {
    pub scanned_profiles: usize,
    pub scanned_files: usize,
    pub removed: usize,
    pub freed_bytes: u64,
    pub freed_display: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct StoreIndex {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    blobs: BTreeMap<String, IndexedBlob>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct IndexedBlob {
    #[serde(default)]
    file: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    modid: Option<String>,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    created_at: u64,
    #[serde(default)]
    last_used_at: u64,
}

impl ModStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn blobs_dir(&self) -> PathBuf {
        self.root.join(BLOBS_DIR)
    }

    fn tmp_dir(&self) -> PathBuf {
        self.root.join(TMP_DIR)
    }

    fn index_path(&self) -> PathBuf {
        self.root.join(INDEX_FILE)
    }

    fn blob_dir(&self, hash: &str) -> PathBuf {
        self.blobs_dir().join(hash)
    }

    fn ensure(&self) -> Result<(), UiError> {
        create_dir_all(self.blobs_dir())
            .map_err(|e| UiError::io(format!("Failed to create the mod store: {e}")))?;
        create_dir_all(self.tmp_dir())
            .map_err(|e| UiError::io(format!("Failed to create the mod store temp dir: {e}")))?;
        Ok(())
    }

    /// Returns whether hardlinks from this store into `dest_dir` work.
    ///
    /// Probes once per process and caches the answer. A false result means the
    /// caller should keep a plain copy instead of uploading bytes into a store
    /// the profile cannot share with.
    pub fn is_usable_for(&self, dest_dir: &Path) -> bool {
        let key = (self.root.clone(), dest_dir.to_path_buf());
        if let Some(cached) = lock(&USABLE_CACHE).get(&key).copied() {
            return cached;
        }

        // Only cache a definitive answer. A missing destination is usually a
        // profile that was deleted mid-operation and may come back later.
        let usable = match self.probe_hardlink(dest_dir) {
            Ok(usable) => usable,
            Err(_) => return false,
        };
        lock(&USABLE_CACHE).insert(key, usable);
        usable
    }

    fn probe_hardlink(&self, dest_dir: &Path) -> Result<bool, UiError> {
        self.ensure()?;
        // Never create a profile directory here: the target may have been
        // deleted while an install was in flight.
        if !dest_dir.is_dir() {
            return Err(UiError::not_found(format!(
                "Mod destination directory {} no longer exists",
                dest_dir.display()
            )));
        }

        let id = Uuid::new_v4();
        let source = self.tmp_dir().join(format!("probe-{id}"));
        let target = dest_dir.join(format!(".storyforge-probe-{id}"));
        fs::write(&source, b"probe")
            .map_err(|e| UiError::io(format!("Failed to write a hardlink probe: {e}")))?;

        let linked = fs::hard_link(&source, &target).is_ok();
        let _ = fs::remove_file(&source);
        let _ = fs::remove_file(&target);
        Ok(linked)
    }

    /// Loads the index, treating a missing or broken file as empty. The index
    /// is a cache; blobs are found by their directory when it is unavailable.
    fn load_index(&self) -> StoreIndex {
        let path = self.index_path();
        let Ok(text) = fs::read_to_string(&path) else {
            return StoreIndex::default();
        };
        match serde_json::from_str::<StoreIndex>(&text) {
            Ok(index) => index,
            Err(error) => {
                log_error!("mod_store: ignoring unreadable index: {error}");
                StoreIndex::default()
            }
        }
    }

    fn save_index(&self, index: &StoreIndex) -> Result<(), UiError> {
        self.ensure()?;
        let text = serde_json::to_string_pretty(index)
            .map_err(|e| UiError::new("serialize_failed", format!("Failed to serialize: {e}")))?;
        let temp = self
            .tmp_dir()
            .join(format!("index-{}.json", Uuid::new_v4()));
        if let Err(error) = fs::write(&temp, text) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to write the mod store index: {error}"
            )));
        }
        if let Err(error) = fs::rename(&temp, self.index_path()) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to replace the mod store index: {error}"
            )));
        }
        Ok(())
    }

    /// Path of the blob file for `hash`, if it exists.
    pub fn blob_file(&self, hash: &str) -> Result<PathBuf, UiError> {
        let Some(hash) = normalize_hash(hash) else {
            return Err(UiError::new("invalid_hash", "Invalid mod store hash"));
        };

        let index = self.load_index();
        if let Some(record) = index.blobs.get(&hash) {
            if !record.file.is_empty() {
                let candidate = self.blob_dir(&hash).join(&record.file);
                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }

        let dir = self.blob_dir(&hash);
        if dir.is_dir() {
            for entry in read_dir(&dir)
                .map_err(|e| UiError::io(format!("Failed to read a mod store blob: {e}")))?
            {
                let path = entry
                    .map_err(|e| UiError::io(format!("Failed to read a mod store blob: {e}")))?
                    .path();
                if path.is_file() {
                    return Ok(path);
                }
            }
        }

        Err(UiError::not_found(format!(
            "Mod store blob {hash} not found"
        )))
    }

    pub fn has_blob(&self, hash: &str) -> bool {
        self.blob_file(hash).is_ok()
    }

    pub fn blob_for_hash(&self, hash: &str) -> Option<StoredBlob> {
        let hash = normalize_hash(hash)?;
        let path = self.blob_file(&hash).ok()?;
        let metadata = fs::metadata(&path).ok()?;
        let index = self.load_index();
        let record = index.blobs.get(&hash);
        Some(StoredBlob {
            hash,
            path: path.to_string_lossy().into_owned(),
            filename: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string(),
            size: metadata.len(),
            modid: record.and_then(|r| r.modid.clone()),
            mod_version: record.and_then(|r| r.version.clone()),
        })
    }

    /// Finds a stored blob by `modid@version`. Used to skip network downloads
    /// and to satisfy pack locks offline.
    pub fn find_by_mod(&self, modid: &str, version: &str) -> Option<StoredBlob> {
        let index = self.load_index();
        index
            .blobs
            .iter()
            .find(|(_, record)| {
                record
                    .modid
                    .as_deref()
                    .is_some_and(|stored| stored.eq_ignore_ascii_case(modid))
                    && record.version.as_deref() == Some(version)
            })
            .and_then(|(hash, _)| self.blob_for_hash(hash))
    }

    /// Hashes a file with SHA-256 (streaming, so large mods do not have to be
    /// read into memory).
    pub fn sha256_file(path: &Path) -> Result<String, UiError> {
        let mut file = File::open(path)
            .map_err(|e| UiError::io(format!("Failed to open {}: {e}", path.display())))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|e| UiError::io(format!("Failed to read {}: {e}", path.display())))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        Ok(format!("{:x}", hasher.finalize()))
    }

    pub fn ingest_bytes(
        &self,
        bytes: &[u8],
        filename: &str,
        meta: &BlobMeta,
    ) -> Result<Ingested, UiError> {
        let hash = sha256_bytes(bytes);
        if let Some(blob) = self.blob_for_hash(&hash) {
            self.update_meta(&hash, meta);
            return Ok(Ingested {
                blob,
                created: false,
            });
        }

        self.ensure()?;
        let temp = self.tmp_dir().join(format!("{}.blob", Uuid::new_v4()));
        if let Err(error) = fs::write(&temp, bytes) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to write a mod into the store: {error}"
            )));
        }
        self.finish_ingest(&hash, filename, temp, meta)
    }

    pub fn ingest_file(
        &self,
        source: &Path,
        filename: &str,
        meta: &BlobMeta,
    ) -> Result<Ingested, UiError> {
        if !source.is_file() {
            return Err(UiError::not_found(format!(
                "File not found: {}",
                source.display()
            )));
        }

        let hash = Self::sha256_file(source)?;
        if let Some(blob) = self.blob_for_hash(&hash) {
            self.update_meta(&hash, meta);
            return Ok(Ingested {
                blob,
                created: false,
            });
        }

        self.ensure()?;
        let temp = self.tmp_dir().join(format!("{}.blob", Uuid::new_v4()));
        if let Err(error) = fs::copy(source, &temp) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to copy {} into the mod store: {error}",
                source.display()
            )));
        }

        // The source can be replaced while it is being copied. Never record
        // bytes under a hash they do not match: every profile linking that
        // blob would receive the wrong mod.
        let copied_hash = match Self::sha256_file(&temp) {
            Ok(hash) => hash,
            Err(error) => {
                let _ = fs::remove_file(&temp);
                return Err(error);
            }
        };
        if copied_hash != hash {
            let _ = fs::remove_file(&temp);
            return Err(UiError::new(
                "file_changed",
                format!("{} changed while it was being stored", source.display()),
            ));
        }

        self.finish_ingest(&hash, filename, temp, meta)
    }

    fn finish_ingest(
        &self,
        hash: &str,
        filename: &str,
        temp: PathBuf,
        meta: &BlobMeta,
    ) -> Result<Ingested, UiError> {
        // Two installs can finish with the same bytes at once. Keep blob
        // creation single-flight so a hash directory never grows duplicates.
        let _guard = lock(&INGEST_LOCK);
        if let Some(blob) = self.blob_for_hash(hash) {
            let _ = fs::remove_file(&temp);
            self.update_meta(hash, meta);
            return Ok(Ingested {
                blob,
                created: false,
            });
        }

        let name = blob_filename(filename);
        let dir = self.blob_dir(hash);
        if let Err(error) = create_dir_all(&dir) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to create a mod store blob dir: {error}"
            )));
        }
        let final_path = dir.join(&name);

        sync_file(&temp).inspect_err(|_| {
            let _ = fs::remove_file(&temp);
        })?;
        if let Err(error) = fs::rename(&temp, &final_path) {
            let _ = fs::remove_file(&temp);
            // Another install may have won the race with the same bytes.
            if let Some(blob) = self.blob_for_hash(hash) {
                self.update_meta(hash, meta);
                return Ok(Ingested {
                    blob,
                    created: false,
                });
            }
            return Err(UiError::io(format!(
                "Failed to move a mod into the store: {error}"
            )));
        }

        let size = fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
        if let Err(error) = self.record_blob(hash, &name, size, meta) {
            // The bytes are safely stored; a broken index only costs cache hits.
            log_error!("mod_store: index update failed: {}", error.message);
        }

        Ok(Ingested {
            blob: StoredBlob {
                hash: hash.to_string(),
                path: final_path.to_string_lossy().into_owned(),
                filename: name,
                size,
                modid: meta.modid.clone(),
                mod_version: meta.version.clone(),
            },
            created: true,
        })
    }

    fn record_blob(
        &self,
        hash: &str,
        file: &str,
        size: u64,
        meta: &BlobMeta,
    ) -> Result<(), UiError> {
        let _guard = lock(&INDEX_LOCK);
        let mut index = self.load_index();
        let now = now_secs();
        {
            let entry = index
                .blobs
                .entry(hash.to_string())
                .or_insert_with(|| IndexedBlob {
                    created_at: now,
                    ..Default::default()
                });
            entry.file = file.to_string();
            entry.size = size;
            if entry.modid.is_none() {
                entry.modid = meta.modid.clone();
            }
            if entry.version.is_none() {
                entry.version = meta.version.clone();
            }
            entry.last_used_at = now;
        }
        index.version = INDEX_VERSION;
        self.save_index(&index)
    }

    fn update_meta(&self, hash: &str, meta: &BlobMeta) {
        if meta.modid.is_none() && meta.version.is_none() {
            return;
        }

        let _guard = lock(&INDEX_LOCK);
        let mut index = self.load_index();

        // The index is only a cache. If it was lost or was written before the
        // blob existed, recover the file name from the blob directory so the
        // metadata is not discarded.
        if !index.blobs.contains_key(hash) {
            let Ok(path) = self.blob_file(hash) else {
                return;
            };
            let file = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("mod.zip")
                .to_string();
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let now = now_secs();
            index.blobs.insert(
                hash.to_string(),
                IndexedBlob {
                    file,
                    size,
                    created_at: now,
                    last_used_at: now,
                    ..Default::default()
                },
            );
            index.version = INDEX_VERSION;
        }

        let Some(entry) = index.blobs.get_mut(hash) else {
            return;
        };

        let mut changed = false;
        if entry.modid.is_none() && meta.modid.is_some() {
            entry.modid = meta.modid.clone();
            changed = true;
        }
        if entry.version.is_none() && meta.version.is_some() {
            entry.version = meta.version.clone();
            changed = true;
        }
        if changed {
            index.version = INDEX_VERSION;
            if let Err(error) = self.save_index(&index) {
                log_error!("mod_store: index metadata update failed: {}", error.message);
            }
        }
    }

    /// Records `modid@version` for a file that is already in the store.
    pub fn record_meta(&self, hash: &str, meta: &BlobMeta) {
        if let Some(hash) = normalize_hash(hash) {
            self.update_meta(&hash, meta);
        }
    }

    /// Hashes a file that is already in the store and records `modid@version`.
    pub fn record_meta_for_file(&self, file: &Path, meta: &BlobMeta) {
        if meta.modid.is_none() && meta.version.is_none() {
            return;
        }
        match Self::sha256_file(file) {
            Ok(hash) => self.update_meta(&hash, meta),
            Err(error) => log_error!(
                "mod_store: could not hash {} for metadata: {}",
                file.display(),
                error.message
            ),
        }
    }

    /// Materialises a blob at `dest`, replacing any existing file atomically.
    ///
    /// A hardlink is tried first; unsupported filesystems get a copy. The
    /// temporary name is inside `dest`'s directory so the final rename is
    /// atomic and never writes through an existing hardlink.
    pub fn link_to(&self, hash: &str, dest: &Path) -> Result<LinkMode, UiError> {
        // Hold off prune while the blob is linked; unlinking the source
        // between the lookup and the hardlink would make an otherwise valid
        // install fail.
        let _guard = lock(&INGEST_LOCK);
        let blob = self.blob_file(hash)?;
        // Existing symlinks must not survive as the profile's mod entry: the
        // store promises real files, not links that can dangle.
        let dest_is_symlink = fs::symlink_metadata(dest)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false);
        if !dest_is_symlink && same_file(&blob, dest) {
            return Ok(LinkMode::Hardlink);
        }

        let parent = dest.parent().ok_or_else(|| {
            UiError::new("invalid_path", "Mod destination has no parent directory")
        })?;
        // Callers create Mods before starting; recreating it here could
        // resurrect a profile that was deleted during the operation.
        if !parent.is_dir() {
            return Err(UiError::not_found(format!(
                "Mod destination directory {} no longer exists",
                parent.display()
            )));
        }

        // A fixed, short name keeps the temporary path under Windows' name
        // limit even when the destination has a very long filename.
        let temp = parent.join(format!(".storyforge-{}.tmp", Uuid::new_v4()));

        let mode = match fs::hard_link(&blob, &temp) {
            Ok(()) => LinkMode::Hardlink,
            Err(error) => {
                log_info!(
                    "mod_store: hardlink unavailable for {} ({}), copying instead",
                    dest.display(),
                    error
                );
                if let Err(copy_error) = fs::copy(&blob, &temp) {
                    let _ = fs::remove_file(&temp);
                    return Err(UiError::io(format!(
                        "Failed to copy a mod into {}: {copy_error}",
                        dest.display()
                    )));
                }
                LinkMode::Copy
            }
        };

        if let Err(error) = fs::rename(&temp, dest) {
            let _ = fs::remove_file(&temp);
            return Err(UiError::io(format!(
                "Failed to put a mod into place at {}: {error}",
                dest.display()
            )));
        }

        Ok(mode)
    }

    pub fn stats(&self) -> Result<StoreStats, UiError> {
        let mut blob_count = 0;
        let mut total_bytes = 0_u64;

        if self.blobs_dir().is_dir() {
            for entry in read_dir(self.blobs_dir())
                .map_err(|e| UiError::io(format!("Failed to read the mod store: {e}")))?
            {
                let dir = entry
                    .map_err(|e| UiError::io(format!("Failed to read the mod store: {e}")))?
                    .path();
                if !dir.is_dir() {
                    continue;
                }
                blob_count += 1;
                total_bytes += dir_size(&dir);
            }
        }

        Ok(StoreStats {
            enabled: true,
            path: self.root.to_string_lossy().into_owned(),
            blob_count,
            total_bytes,
            total_display: format_size(total_bytes),
        })
    }

    pub fn prune(&self, keep: &HashSet<String>) -> Result<PruneReport, UiError> {
        // Do not remove a blob directory while a concurrent ingest is moving
        // its finished temp file into that directory.
        let _guard = lock(&INGEST_LOCK);
        let mut report = PruneReport::default();
        if self.blobs_dir().is_dir() {
            for entry in read_dir(self.blobs_dir())
                .map_err(|e| UiError::io(format!("Failed to read the mod store: {e}")))?
            {
                let dir = entry
                    .map_err(|e| UiError::io(format!("Failed to read the mod store: {e}")))?
                    .path();
                if !dir.is_dir() {
                    continue;
                }
                let Some(hash) = dir.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                if keep.contains(hash) {
                    continue;
                }

                let freed = dir_size(&dir);
                match fs::remove_dir_all(&dir) {
                    Ok(()) => {
                        report.removed += 1;
                        report.freed_bytes += freed;
                    }
                    Err(error) => report
                        .errors
                        .push(format!("Failed to remove store blob {hash}: {error}")),
                }
            }
        }

        let _guard = lock(&INDEX_LOCK);
        let mut index = self.load_index();
        index.blobs.retain(|hash, _| self.blob_dir(hash).is_dir());
        if let Err(error) = self.save_index(&index) {
            report.errors.push(format!(
                "Failed to update the store index: {}",
                error.message
            ));
        }

        report.freed_display = format_size(report.freed_bytes);
        Ok(report)
    }
}

/// Serialises store-aware changes to profile mod files.
pub fn lock_mod_mutations() -> std::sync::MutexGuard<'static, ()> {
    lock(&MOD_MUTATION_LOCK)
}

/// Resolves the central store for an app handle. `None` when the user turned
/// shared mod storage off.
pub fn for_app(app: &AppHandle) -> Result<Option<ModStore>, UiError> {
    if !enabled(app) {
        return Ok(None);
    }
    Ok(Some(ModStore::new(folder(app)?)))
}

/// Optional-store lookup for operations that must still work without it.
///
/// A store path can only fail to resolve when the profiles folder is broken;
/// in that case the caller falls back to ordinary files instead of failing the
/// whole install or download.
pub fn for_app_best_effort(app: &AppHandle) -> Option<ModStore> {
    match for_app(app) {
        Ok(store) => store,
        Err(error) => {
            log_error!(
                "mod_store: unavailable, using plain files: {}",
                error.message
            );
            None
        }
    }
}

pub fn enabled(app: &AppHandle) -> bool {
    app.zustand()
        .get::<bool>("settings", "modStoreEnabled")
        .unwrap_or(true)
}

pub fn folder(app: &AppHandle) -> Result<PathBuf, UiError> {
    Ok(profiles_folder(app.clone())?.join(paths::MOD_STORE_SUBDIR))
}

fn normalize_hash(value: &str) -> Option<String> {
    let hash = value.trim().to_ascii_lowercase();
    (hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(hash)
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn sync_file(path: &Path) -> Result<(), UiError> {
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|e| UiError::io(format!("Failed to flush {}: {e}", path.display())))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn same_file(left: &Path, right: &Path) -> bool {
    right.is_file() && same_file::is_same_file(left, right).unwrap_or(false)
}

fn file_stamp(path: &Path) -> Option<(u64, Option<SystemTime>)> {
    fs::metadata(path)
        .ok()
        .map(|metadata| (metadata.len(), metadata.modified().ok()))
}

fn is_zip(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
}

/// Reduces a remote or user-supplied name to a safe, bounded blob filename.
/// The directory is keyed by hash, so this only affects readability.
fn blob_filename(filename: &str) -> String {
    let mut name = safe_file_name(filename).unwrap_or_else(|_| "mod.zip".to_string());
    name = name
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) || character.is_control()
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    name = name
        .trim_matches(|character: char| character == '.' || character == ' ')
        .to_string();
    if name.is_empty() {
        name = "mod.zip".to_string();
    }

    // Windows device names are unusable as file names even with an extension.
    let stem = Path::new(&name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("")
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit());
    if reserved {
        name = format!("_{name}");
    }

    if name.chars().count() <= MAX_BLOB_NAME {
        return name;
    }

    let extension = Path::new(&name)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    let stem_limit = MAX_BLOB_NAME.saturating_sub(extension.len() + 1);
    let stem: String = Path::new(&name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("mod")
        .chars()
        .take(stem_limit)
        .collect();
    let name = if extension.is_empty() {
        stem
    } else {
        format!("{stem}.{extension}")
    };
    let name: String = name.chars().take(MAX_BLOB_NAME).collect();
    if name.is_empty() {
        "mod.zip".to_string()
    } else {
        name
    }
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|metadata| metadata.is_file())
        .map(|metadata| metadata.len())
        .sum()
}

/// Adds every hardlinkable mod zip in a profile to the store.
///
/// Idempotent: files already linked to their blob are counted and left alone.
/// Profiles on another filesystem are skipped as a whole so a migration never
/// duplicates every mod.
pub fn optimize_profile(store: &ModStore, profile_dir: &Path) -> Result<ProfileOptimize, UiError> {
    let mods_dir = paths::mods_dir(profile_dir);
    let mut report = ProfileOptimize::default();
    if !mods_dir.is_dir() {
        return Ok(report);
    }

    let _guard = lock_mod_mutations();
    if !store.is_usable_for(&mods_dir) {
        report.skipped = read_dir(&mods_dir)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|entry| is_zip(&entry.path()))
                    .count()
            })
            .unwrap_or(0);
        return Ok(report);
    }

    for entry in read_dir(&mods_dir)
        .map_err(|e| UiError::io(format!("Failed to read {}: {e}", mods_dir.display())))?
    {
        let path = entry
            .map_err(|e| UiError::io(format!("Failed to read {}: {e}", mods_dir.display())))?
            .path();
        if !path.is_file() || !is_zip(&path) {
            continue;
        }
        report.files += 1;
        let stamp = file_stamp(&path);

        let info = match super::mods::inspect_mod_zip(&path) {
            Ok(info) => info,
            Err(error) => {
                report.failed += 1;
                report
                    .errors
                    .push(format!("{}: {}", path.display(), error.message));
                continue;
            }
        };

        let meta = BlobMeta {
            modid: Some(info.modid.clone()),
            version: Some(info.version.clone()),
        };
        let ingested = match store.ingest_file(&path, &info.filename, &meta) {
            Ok(ingested) => ingested,
            Err(error) => {
                report.failed += 1;
                report
                    .errors
                    .push(format!("{}: {}", path.display(), error.message));
                continue;
            }
        };

        if same_file(Path::new(&ingested.blob.path), &path) {
            report.already_linked += 1;
            continue;
        }

        // A mod install, toggle, or delete can race with an explicit optimize.
        // Only replace the path if it is still the file that was hashed; never
        // resurrect a mod the user just removed or overwrite a newer download.
        let unchanged = stamp.is_some() && file_stamp(&path) == stamp;
        if !unchanged {
            report.skipped += 1;
            report.errors.push(format!(
                "{}: changed while optimizing; left untouched",
                path.display()
            ));
            continue;
        }

        match store.link_to(&ingested.blob.hash, &path) {
            Ok(LinkMode::Hardlink) => {
                report.linked += 1;
                if !ingested.created {
                    report.reclaimed_bytes += ingested.blob.size;
                }
            }
            Ok(LinkMode::Copy) => report.copied += 1,
            Err(error) => {
                report.failed += 1;
                report
                    .errors
                    .push(format!("{}: {}", path.display(), error.message));
            }
        }
    }

    Ok(report)
}

fn optimize_all(app: &AppHandle) -> Result<OptimizeReport, UiError> {
    let Some(store) = for_app(app)? else {
        return Ok(OptimizeReport {
            disabled: true,
            ..Default::default()
        });
    };

    let dirs = profiles::all_profile_dirs(app)?;
    let mut report = OptimizeReport {
        profiles: dirs.len(),
        ..Default::default()
    };

    for dir in dirs {
        let id = generate_id(&dir_name(&dir));
        if profiles::is_profile_running(id) {
            report.skipped += 1;
            report
                .errors
                .push(format!("{}: stop the game first", dir.display()));
            continue;
        }

        match optimize_profile(&store, &dir) {
            Ok(result) => {
                report.files += result.files;
                report.linked += result.linked;
                report.already_linked += result.already_linked;
                report.copied += result.copied;
                report.skipped += result.skipped;
                report.failed += result.failed;
                report.reclaimed_bytes += result.reclaimed_bytes;
                report.errors.extend(result.errors);
            }
            Err(error) => {
                report.failed += 1;
                report
                    .errors
                    .push(format!("{}: {}", dir.display(), error.message));
            }
        }
    }

    report.reclaimed_display = format_size(report.reclaimed_bytes);
    Ok(report)
}

fn prune_all(app: &AppHandle) -> Result<PruneReport, UiError> {
    let store = ModStore::new(folder(app)?);
    let mut roots = profiles::all_profile_dirs(app)?;

    let profiles_root = profiles_folder(app.clone())?.join(profiles_subdir(app.clone()));
    let deleted = profiles_root.join(profile_ops::DELETED_DIR);
    if deleted.is_dir() {
        for entry in read_dir(&deleted)
            .map_err(|e| UiError::io(format!("Failed to read deleted profiles: {e}")))?
        {
            let path = entry
                .map_err(|e| UiError::io(format!("Failed to read deleted profiles: {e}")))?
                .path();
            if path.is_dir() {
                roots.push(path);
            }
        }
    }
    roots.extend(server_hosting::data_dirs(app));

    let mut keep = HashSet::new();
    let mut report = PruneReport {
        scanned_profiles: roots.len(),
        ..Default::default()
    };

    for root in &roots {
        let mods = paths::mods_dir(root);
        if !mods.is_dir() {
            continue;
        }
        for entry in read_dir(&mods)
            .map_err(|e| UiError::io(format!("Failed to read {}: {e}", mods.display())))?
        {
            let path = entry
                .map_err(|e| UiError::io(format!("Failed to read {}: {e}", mods.display())))?
                .path();
            if !path.is_file() || !is_zip(&path) {
                continue;
            }
            report.scanned_files += 1;
            match ModStore::sha256_file(&path) {
                Ok(hash) => {
                    keep.insert(hash);
                }
                Err(error) => report
                    .errors
                    .push(format!("{}: {}", path.display(), error.message)),
            }
        }
    }

    let pruned = store.prune(&keep)?;
    report.removed = pruned.removed;
    report.freed_bytes = pruned.freed_bytes;
    report.freed_display = pruned.freed_display;
    report.errors.extend(pruned.errors);
    Ok(report)
}

// ── Commands ──

#[command]
pub fn get_mod_store_stats(app: AppHandle) -> Result<StoreStats, UiError> {
    let store = ModStore::new(folder(&app)?);
    let mut stats = store.stats()?;
    stats.enabled = enabled(&app);
    Ok(stats)
}

#[command]
pub async fn optimize_mod_store(app: AppHandle) -> Result<OptimizeReport, UiError> {
    tokio::task::spawn_blocking(move || optimize_all(&app))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Optimize failed: {e}")))?
}

#[command]
pub async fn prune_mod_store(app: AppHandle) -> Result<PruneReport, UiError> {
    tokio::task::spawn_blocking(move || prune_all(&app))
        .await
        .map_err(|e| UiError::new("internal_error", format!("Prune failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn meta(modid: &str, version: &str) -> BlobMeta {
        BlobMeta {
            modid: Some(modid.to_string()),
            version: Some(version.to_string()),
        }
    }

    fn write_mod_zip(path: &Path, modid: &str, version: &str) {
        let file = File::create(path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .start_file("modinfo.json", zip::write::SimpleFileOptions::default())
            .unwrap();
        let info = serde_json::json!({
            "modid": modid,
            "name": modid,
            "version": version,
            "type": "code",
            "side": "universal",
        });
        writer.write_all(info.to_string().as_bytes()).unwrap();
        writer.finish().unwrap();
    }

    #[test]
    fn ingest_dedupes_and_links_two_profiles_to_one_blob() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let signature = meta("carryon", "1.13.0");

        let first = store
            .ingest_bytes(b"same mod bytes", "carryon_1.13.0.zip", &signature)
            .unwrap();
        let second = store
            .ingest_bytes(b"same mod bytes", "renamed.zip", &signature)
            .unwrap();
        assert!(first.created);
        assert!(!second.created);
        assert_eq!(first.blob.hash, second.blob.hash);

        let profile_a = temp.path().join("profiles/a/Mods");
        let profile_b = temp.path().join("profiles/b/Mods");
        create_dir_all(&profile_a).unwrap();
        create_dir_all(&profile_b).unwrap();
        let dest_a = profile_a.join("carryon_1.13.0.zip");
        let dest_b = profile_b.join("renamed.zip");
        assert_eq!(
            store.link_to(&first.blob.hash, &dest_a).unwrap(),
            LinkMode::Hardlink
        );
        assert_eq!(
            store.link_to(&first.blob.hash, &dest_b).unwrap(),
            LinkMode::Hardlink
        );

        assert!(same_file(Path::new(&first.blob.path), &dest_a));
        assert!(same_file(Path::new(&first.blob.path), &dest_b));
        assert_eq!(store.stats().unwrap().blob_count, 1);
        assert_eq!(
            store.find_by_mod("CarryOn", "1.13.0").unwrap().hash,
            first.blob.hash
        );
    }

    #[test]
    fn linking_replaces_a_destination_without_touching_the_blob() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let ingested = store
            .ingest_bytes(b"new bytes", "mod.zip", &BlobMeta::default())
            .unwrap();

        let dest = temp.path().join("profile/Mods/mod.zip");
        create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(&dest, b"old bytes").unwrap();

        store.link_to(&ingested.blob.hash, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"new bytes");
        assert_eq!(fs::read(&ingested.blob.path).unwrap(), b"new bytes");
        assert!(same_file(Path::new(&ingested.blob.path), &dest));
    }

    #[test]
    fn probing_a_missing_destination_does_not_create_it() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let missing = temp.path().join("deleted-profile/Mods");
        assert!(!store.is_usable_for(&missing));
        assert!(!missing.exists());
    }

    #[test]
    fn prune_removes_only_unreferenced_blobs() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let keep = store
            .ingest_bytes(b"keep", "keep.zip", &BlobMeta::default())
            .unwrap();
        let drop = store
            .ingest_bytes(b"drop", "drop.zip", &BlobMeta::default())
            .unwrap();

        let keep_set = HashSet::from([keep.blob.hash.clone()]);
        let report = store.prune(&keep_set).unwrap();
        assert_eq!(report.removed, 1);
        assert!(store.blob_for_hash(&keep.blob.hash).is_some());
        assert!(store.blob_for_hash(&drop.blob.hash).is_none());
    }

    #[test]
    fn optimize_links_an_existing_profile_and_is_idempotent() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let profile = temp.path().join("profile");
        let mods = paths::mods_dir(&profile);
        create_dir_all(&mods).unwrap();
        let mod_zip = mods.join("carryon_1.13.0.zip");
        write_mod_zip(&mod_zip, "carryon", "1.13.0");

        let report = optimize_profile(&store, &profile).unwrap();
        assert_eq!(report.files, 1);
        assert_eq!(report.linked, 1);
        let blob = store.find_by_mod("carryon", "1.13.0").unwrap();
        assert!(same_file(Path::new(&blob.path), &mod_zip));

        let again = optimize_profile(&store, &profile).unwrap();
        assert_eq!(again.already_linked, 1);
        assert_eq!(again.linked, 0);
    }

    #[test]
    fn metadata_is_recovered_after_the_index_is_lost() {
        let temp = tempfile::tempdir().unwrap();
        let store = ModStore::new(temp.path().join("store"));
        let signature = meta("carryon", "1.13.0");
        let first = store
            .ingest_bytes(b"same mod bytes", "carryon.zip", &signature)
            .unwrap();
        fs::remove_file(store.index_path()).unwrap();

        // Re-ingesting the same bytes finds the blob by directory even though
        // the index is gone, then rebuilds its metadata entry.
        store
            .ingest_bytes(b"same mod bytes", "carryon.zip", &signature)
            .unwrap();
        assert_eq!(
            store.find_by_mod("carryon", "1.13.0").unwrap().hash,
            first.blob.hash
        );
    }

    #[test]
    fn blob_name_is_bounded_and_windows_safe() {
        let long = format!("{}:?.zip", "a".repeat(200));
        let name = blob_filename(&long);
        assert!(name.chars().count() <= MAX_BLOB_NAME);
        assert!(!name.contains(':'));
        assert!(!name.contains('?'));
        assert!(name.ends_with(".zip"));
    }
}
