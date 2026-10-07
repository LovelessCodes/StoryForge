import { describe, expect, it } from "vitest";

import { buildManifest, manifestFileName, planImport } from "./modpack-manifest";
import type { OutputMod } from "./types";

function mod(modid: string, version: string): OutputMod {
  return {
    modid,
    name: `${modid} name`,
    authors: [],
    version,
    path: `/profile/Mods/${modid}_${version}.zip`,
  };
}

describe("planImport", () => {
  it("marks unseen mods as new", () => {
    const plan = planImport(
      { name: "Pack", gameVersion: "1.21.3", mods: [{ modid: "carryon", version: "1.13.0" }] },
      [],
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].status.kind).toBe("new");
  });

  it("marks the exact installed version as same", () => {
    const plan = planImport(
      { name: "Pack", gameVersion: "1.21.3", mods: [{ modid: "carryon", version: "1.13.0" }] },
      [mod("carryon", "1.13.0")],
    );
    expect(plan[0].status.kind).toBe("same");
  });

  it("marks a different installed version as a replace", () => {
    const plan = planImport(
      { name: "Pack", gameVersion: "1.21.3", mods: [{ modid: "carryon", version: "1.13.0" }] },
      [mod("carryon", "1.12.0")],
    );
    expect(plan[0].status.kind).toBe("replace");
  });

  it("matches modids case-insensitively", () => {
    const plan = planImport(
      { name: "Pack", gameVersion: "1.21.3", mods: [{ modid: "CarryOn", version: "1.13.0" }] },
      [mod("carryon", "1.13.0")],
    );
    expect(plan[0].status.kind).toBe("same");
  });
});

describe("buildManifest", () => {
  it("keeps modid, version and display name", () => {
    const manifest = buildManifest("My Pack", "1.22.5", [mod("carryon", "1.13.0")]);
    expect(manifest).toEqual({
      name: "My Pack",
      gameVersion: "1.22.5",
      mods: [{ modid: "carryon", version: "1.13.0", name: "carryon name" }],
    });
  });
});

describe("manifestFileName", () => {
  it("sanitizes path-hostile characters and keeps the extension", () => {
    expect(manifestFileName("Anego / Server: pack?")).toBe("Anego _ Server_ pack_.json");
  });

  it("falls back when the name is empty", () => {
    expect(manifestFileName("  ")).toBe("modpack.json");
  });
});
