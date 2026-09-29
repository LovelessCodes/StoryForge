import { describe, expect, it, vi } from "vitest";

// The utils module reads the platform at import time via the Tauri OS plugin.
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  compareSemverAsc,
  compareSemverDesc,
  hashPath,
  latestRelease,
  makeStringFolderSafe,
  pathBasename,
} from "./utils";

describe("makeStringFolderSafe", () => {
  it("lowercases and replaces unsafe characters", () => {
    expect(makeStringFolderSafe("My World")).toBe("my_world");
    expect(makeStringFolderSafe("../../etc")).toBe("______etc");
    expect(makeStringFolderSafe("Mixed-CASE_123")).toBe("mixed_case_123");
  });
});

describe("pathBasename", () => {
  it("handles unix and windows separators", () => {
    expect(pathBasename("/home/user/installations/my_world")).toBe("my_world");
    expect(pathBasename("C:\\Users\\me\\installations\\my_world")).toBe("my_world");
    expect(pathBasename("/a/b/world.vcdbs")).toBe("world.vcdbs");
    expect(pathBasename("")).toBe("");
  });
});

describe("compareSemverDesc / Asc", () => {
  it("orders versions, ignoring non-numeric parts", () => {
    const versions = ["1.20.6", "1.22.3", "1.21.0-rc.1"];
    expect([...versions].sort(compareSemverDesc)).toEqual(["1.22.3", "1.21.0-rc.1", "1.20.6"]);
    expect([...versions].sort(compareSemverAsc)).toEqual(["1.20.6", "1.21.0-rc.1", "1.22.3"]);
  });

  it("treats missing parts as zero", () => {
    expect(compareSemverDesc("1.22", "1.22.0")).toBe(0);
    expect(compareSemverDesc("2", "1.9.9")).toBeLessThan(0);
  });
});

describe("latestRelease", () => {
  it("returns the highest release regardless of input order", () => {
    const releases = [
      { mainfile: "a", modversion: "1.0.0" },
      { mainfile: "b", modversion: "1.2.0" },
      { mainfile: "c", modversion: "1.10.0" },
      { mainfile: "d", modversion: "1.9.0" },
    ];
    expect(latestRelease(releases)?.modversion).toBe("1.10.0");
    expect(latestRelease([])).toBeUndefined();
    expect(latestRelease(undefined)).toBeUndefined();
  });
});

describe("hashPath", () => {
  it("is stable for the same path and differs for others", () => {
    expect(hashPath("/a/b")).toBe(hashPath("/a/b"));
    expect(hashPath("/a/b")).not.toBe(hashPath("/a/c"));
  });
});
