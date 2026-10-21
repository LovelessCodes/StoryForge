import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

/**
 * Persisted TanStack Query cache (IndexedDB) so pages open with their last
 * data instead of spinners, then revalidate in the background.
 *
 * Persistence is best effort: if IndexedDB is unavailable or throws, queries
 * simply run without it.
 */
export const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

/** In-memory retention must outlive the persisted cache or restores get dropped. */
export const QUERY_CACHE_GC_TIME = QUERY_CACHE_MAX_AGE + 1000 * 60 * 60;

const CACHE_KEY = "storyforge-query-cache";

/** Live, large or ephemeral data that should not outlive a restart. */
const EXCLUDED_ROOTS = new Set([
  "app-folder",
  "app-version",
  "launcherLogins",
  "modpack-slug-availability",
  "profileLog",
  "profileLogs",
  "screenshotFull",
  "screenshotImage",
  "screenshots",
  "serverDataDirSize",
  "serverStatus",
  "updater",
  "map-bounds-direct",
  "map-tiles-direct",
  "world-map",
]);

/**
 * The mod browser keys its catalog as `["mods", { search, versions }]`. Only the
 * unfiltered catalog is worth restoring: it is what lets the page open with the
 * mods already listed. A searched or version-filtered result is a separate
 * multi-megabyte entry, and the persister re-serialises the whole snapshot on
 * every write, so restoring them would grow the cache by one catalog per
 * keystroke.
 */
function isBaseModsQuery(params: unknown): boolean {
  if (!params || typeof params !== "object") return false;
  const { search, versions } = params as { search?: unknown; versions?: unknown };
  return (search ?? "") === "" && Array.isArray(versions) && versions.length === 0;
}

export function shouldPersistQuery(query: { queryKey: readonly unknown[] }): boolean {
  const [root, params] = query.queryKey;
  if (typeof root !== "string" || EXCLUDED_ROOTS.has(root)) return false;
  if (root === "mods") return isBaseModsQuery(params);
  return true;
}

function createQueryCachePersister() {
  if (typeof indexedDB === "undefined") return null;

  const storage = {
    getItem: async (key: string) => {
      try {
        return (await get<string>(key)) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string) => {
      try {
        await set(key, value);
      } catch {
        // A full or blocked IndexedDB must not affect the app.
      }
    },
    removeItem: async (key: string) => {
      try {
        await del(key);
      } catch {
        // Ignore — there is nothing to clean up if the write never landed.
      }
    },
  };

  return createAsyncStoragePersister({ key: CACHE_KEY, storage, throttleTime: 1000 });
}

export const queryCachePersister = createQueryCachePersister();
