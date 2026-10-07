import { describe, expect, it } from "vitest";

import type { ModUpdatesResponse } from "@/hooks/use-mod-updates";

import { filterModUpdates, updateTargetsGameVersion } from "./mod-updates";

function update(modidstr: string, modversion: string, tags: string[]) {
  return {
    releaseid: 1,
    mainfile: "https://example.com/mod.zip",
    filename: `${modidstr}.zip`,
    fileid: 1,
    downloads: 1,
    tags,
    modidstr,
    modversion,
    created: "2026-01-01",
  };
}

describe("updateTargetsGameVersion", () => {
  it("accepts releases tagged with the profile's version", () => {
    expect(updateTargetsGameVersion(update("a", "1.0.0", ["1.22.7"]), "1.22.7")).toBe(true);
  });

  it("rejects releases for another game version", () => {
    expect(updateTargetsGameVersion(update("a", "2.0.0", ["1.23.0"]), "1.22.7")).toBe(false);
  });

  it("keeps releases without tags or without a profile version", () => {
    expect(updateTargetsGameVersion(update("a", "2.0.0", []), "1.22.7")).toBe(true);
    expect(updateTargetsGameVersion(update("a", "2.0.0", ["1.23.0"]), "")).toBe(true);
  });
});

describe("filterModUpdates", () => {
  const response: ModUpdatesResponse = {
    statuscode: "200",
    updates: {
      a: update("a", "1.0.0", ["1.22.7"]),
      b: update("b", "2.0.0", ["1.23.0"]),
      c: update("c", "3.0.0", ["1.22.7"]),
    },
  };

  it("drops other game versions and skipped releases", () => {
    const filtered = filterModUpdates(response, "1.22.7", { c: "3.0.0" });
    expect(Object.keys(filtered?.updates ?? {})).toEqual(["a"]);
  });

  it("matches skips case-insensitively on the modidstr", () => {
    const filtered = filterModUpdates(response, "1.22.7", { C: "3.0.0" });
    expect(Object.keys(filtered?.updates ?? {})).toEqual(["a"]);
  });

  it("only skips the named version", () => {
    const filtered = filterModUpdates(response, "", { a: "0.9.0" });
    expect(Object.keys(filtered?.updates ?? {})).toEqual(["a", "b", "c"]);
  });

  it("passes undefined through", () => {
    expect(filterModUpdates(undefined, "1.22.7", {})).toBeUndefined();
  });
});
