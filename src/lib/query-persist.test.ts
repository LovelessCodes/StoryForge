import { describe, expect, it } from "vitest";

import { QUERY_CACHE_GC_TIME, QUERY_CACHE_MAX_AGE, shouldPersistQuery } from "./query-persist";

describe("shouldPersistQuery", () => {
  it("persists cacheable page data", () => {
    expect(shouldPersistQuery({ queryKey: ["news"] })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["mods", { page: 1 }] })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["publicServers"] })).toBe(true);
    expect(shouldPersistQuery({ queryKey: ["installedMods", "/profiles/a"] })).toBe(true);
  });

  it("skips live, ephemeral and map data", () => {
    for (const root of [
      "app-folder",
      "app-version",
      "modpack-slug-availability",
      "profileLog",
      "profileLogs",
      "serverDataDirSize",
      "serverStatus",
      "updater",
      "map-bounds-direct",
      "map-tiles-direct",
      "world-map",
    ]) {
      expect(shouldPersistQuery({ queryKey: [root, "arg"] })).toBe(false);
    }
  });

  it("skips non-string roots", () => {
    expect(shouldPersistQuery({ queryKey: [42] })).toBe(false);
    expect(shouldPersistQuery({ queryKey: [] })).toBe(false);
  });
});

describe("cache lifetimes", () => {
  it("keeps in-memory data longer than the persisted cache", () => {
    expect(QUERY_CACHE_GC_TIME).toBeGreaterThan(QUERY_CACHE_MAX_AGE);
  });
});
