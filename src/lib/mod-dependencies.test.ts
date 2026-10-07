import { describe, expect, it, vi } from "vitest";

// mod-dependencies -> helpers reads the platform at import time via the Tauri
// OS plugin.
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { pickDependencyRelease, findMissingDependencies } from "./mod-dependencies";
import type { OutputMod, Release } from "./types";

const release = (modversion: string): Release => ({
  releaseid: 1,
  mainfile: `https://example.invalid/${modversion}.zip`,
  filename: `${modversion}.zip`,
  fileid: 1,
  downloads: 0,
  tags: [],
  modidstr: "dep",
  modversion,
  created: "2025-01-01",
  changelog: null,
});

describe("pickDependencyRelease", () => {
  const releases = [release("1.0.0"), release("2.0.0"), release("1.5.0")];

  it("picks the newest release for an empty requirement", () => {
    expect(pickDependencyRelease(releases, "")?.modversion).toBe("2.0.0");
    expect(pickDependencyRelease(releases, "  ")?.modversion).toBe("2.0.0");
  });

  it("picks the newest release satisfying a minimum version", () => {
    expect(pickDependencyRelease(releases, "1.2.0")?.modversion).toBe("2.0.0");
    expect(pickDependencyRelease(releases, "1.5.0")?.modversion).toBe("2.0.0");
  });

  it("falls back to the newest release when nothing satisfies the requirement", () => {
    expect(pickDependencyRelease(releases, "3.0.0")?.modversion).toBe("2.0.0");
  });

  it("returns undefined for no releases", () => {
    expect(pickDependencyRelease(undefined, "1.0.0")).toBeUndefined();
    expect(pickDependencyRelease([], "1.0.0")).toBeUndefined();
  });
});

describe("findMissingDependencies", () => {
  const installed = (
    modid: string,
    name: string,
    dependencies: Record<string, string>,
  ): OutputMod => ({
    modid,
    name,
    authors: [],
    version: "1.0.0",
    path: `/mods/${modid}.zip`,
    dependencies,
  });

  it("lists dependencies that are not installed", () => {
    const missing = findMissingDependencies([
      installed("carryon", "Carry On", { game: "1.21.5", sodium: "1.2.0" }),
      installed("stonequarry", "Stone Quarry", { sodium: "", libfoo: "2.0.0" }),
    ]);

    expect(missing).toEqual([
      { modid: "libfoo", constraint: "2.0.0", requiredBy: ["Stone Quarry"] },
      { modid: "sodium", constraint: "1.2.0", requiredBy: ["Carry On", "Stone Quarry"] },
    ]);
  });

  it("ignores the game entry and installed mods, case-insensitively", () => {
    const missing = findMissingDependencies([
      installed("alpha", "Alpha", { game: "1.21.5", Beta: "1.0.0" }),
      installed("beta", "Beta", {}),
    ]);
    expect(missing).toEqual([]);
  });

  it("handles missing dependency data", () => {
    expect(findMissingDependencies(undefined)).toEqual([]);
    expect(findMissingDependencies([installed("alpha", "Alpha", {})])).toEqual([]);
  });
});
