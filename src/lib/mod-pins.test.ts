import { describe, expect, it, vi } from "vitest";

// mod-pins -> types only, but keep the Tauri mocks consistent with the other
// lib tests (helpers reads the platform at import time).
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { isModPinned, updateCheckParams } from "./mod-pins";
import type { OutputMod } from "./types";

const mod = (modid: string, version: string): OutputMod => ({
  modid,
  name: modid,
  authors: [],
  version,
  path: `/mods/${modid}_${version}.zip`,
});

describe("isModPinned", () => {
  it("compares modids case-insensitively", () => {
    expect(isModPinned(["sodium"], "Sodium")).toBe(true);
    expect(isModPinned(["sodium"], "sodium")).toBe(true);
    expect(isModPinned(["sodium"], "other")).toBe(false);
    expect(isModPinned([], "sodium")).toBe(false);
    expect(isModPinned(undefined, "sodium")).toBe(false);
  });
});

describe("updateCheckParams", () => {
  const mods = [mod("sodium", "1.2.3"), mod("CarryOn", "2.0.0"), mod("chisel", "3.1.0")];

  it("lists every mod as modid@version", () => {
    expect(updateCheckParams(mods, [])).toBe("sodium@1.2.3,CarryOn@2.0.0,chisel@3.1.0");
  });

  it("skips pinned mods so they are never offered updates", () => {
    expect(updateCheckParams(mods, ["carryon"])).toBe("sodium@1.2.3,chisel@3.1.0");
  });

  it("handles empty input", () => {
    expect(updateCheckParams(undefined, [])).toBe("");
    expect(updateCheckParams(mods, ["sodium", "carryon", "chisel"])).toBe("");
  });
});
