import { describe, expect, it, vi } from "vitest";

import type { MapEntry } from "@/hooks/use-world-map";
import type { World } from "@/lib/types";
import type { Profile } from "@/stores/profiles";

// `lib/helpers` reads the Tauri OS plugin at import time, which needs a window.
vi.mock("@/lib/helpers", () => ({
  pathBasename: (path: string) => path.split("/").filter(Boolean).pop() ?? "",
}));

import { filterMaps, filterWorlds, standaloneMaps } from "./worlds-utils";

function profile(id: number, folder: string): Profile {
  return { id, name: folder, path: `/profiles/${folder}` } as Profile;
}

function world({
  hasMap = true,
  lastPlayed = null,
  name,
  profileName = "alpha",
  saveId = "",
}: {
  hasMap?: boolean;
  lastPlayed?: string | null;
  name: string;
  profileName?: string;
  saveId?: string;
}): World {
  return {
    data: {
      last_played: lastPlayed,
      savegame_identifier: saveId,
      world_name: name,
    } as World["data"],
    has_map: hasMap,
    map_markers: null,
    path: `/profiles/${profileName}/Saves/${name}.vcdbs`,
    profile_name: profileName,
    prospecting_logs: [],
  };
}

function map(id: number, name: string, profileId: number): MapEntry {
  return {
    id,
    name,
    path: `/maps/${name}`,
    profile_id: profileId,
    profile_name: "alpha",
    size_bytes: 0,
  };
}

const profiles = [profile(1, "alpha"), profile(2, "bravo")];

describe("standaloneMaps", () => {
  it("drops maps that belong to a world save", () => {
    const worlds = [world({ name: "Alpha", saveId: "alpha-save" })];
    const maps = [map(1, "alpha-save", 1), map(2, "loose", 1)];
    expect(standaloneMaps(maps, worlds).map((entry) => entry.name)).toEqual(["loose"]);
  });

  it("keeps every map when no world has one", () => {
    const worlds = [world({ hasMap: false, name: "Alpha", saveId: "alpha-save" })];
    const maps = [map(1, "alpha-save", 1)];
    expect(standaloneMaps(maps, worlds)).toHaveLength(1);
  });
});

describe("filterWorlds", () => {
  it("matches names case-insensitively and keeps every profile for a null filter", () => {
    const worlds = [
      world({ name: "Alpha World", profileName: "alpha" }),
      world({ name: "Beta World", profileName: "bravo" }),
    ];
    expect(
      filterWorlds(worlds, profiles, "alpha", null).map((item) => item.data.world_name),
    ).toEqual(["Alpha World"]);
  });

  it("filters by the world's profile folder", () => {
    const worlds = [
      world({ name: "Alpha World", profileName: "alpha" }),
      world({ name: "Bravo World", profileName: "bravo" }),
    ];
    expect(filterWorlds(worlds, profiles, "", 2).map((item) => item.data.world_name)).toEqual([
      "Bravo World",
    ]);
  });

  it("sorts the most recently played first and undated worlds last", () => {
    const worlds = [
      world({ lastPlayed: null, name: "Never" }),
      world({ lastPlayed: "2024-01-01T00:00:00Z", name: "Old" }),
      world({ lastPlayed: "2024-06-01T00:00:00Z", name: "New" }),
    ];
    expect(filterWorlds(worlds, profiles, "", null).map((item) => item.data.world_name)).toEqual([
      "New",
      "Old",
      "Never",
    ]);
  });
});

describe("filterMaps", () => {
  it("matches names and the profile filter", () => {
    const maps = [map(1, "alpha-map", 1), map(2, "bravo-map", 2)];
    expect(filterMaps(maps, "map", null).map((entry) => entry.name)).toEqual([
      "alpha-map",
      "bravo-map",
    ]);
    expect(filterMaps(maps, "", 2).map((entry) => entry.name)).toEqual(["bravo-map"]);
  });
});
