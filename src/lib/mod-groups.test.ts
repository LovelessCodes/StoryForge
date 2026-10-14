import { describe, expect, it } from "vitest";

import type { OutputMod } from "@/lib/types";

import { moveMods, reorderGroups, sectionMods, type ModGroup } from "./mod-groups";

function mod(modid: string, version = "1.0.0"): OutputMod {
  return {
    modid,
    name: `Mod ${modid}`,
    authors: [],
    version,
    path: `/mods/${modid}_${version}.zip`,
  };
}

const groups: ModGroup[] = [
  { id: "g1", name: "Performance", modids: ["smooth", "fastmap"] },
  { id: "g2", name: "Content", modids: ["ruins"] },
];

describe("moveMods", () => {
  it("moves modids from their old group into the target", () => {
    const next = moveMods(groups, ["fastmap", "ruins"], "g1");
    expect(next[0].modids).toEqual(["smooth", "fastmap", "ruins"]);
    expect(next[1].modids).toEqual([]);
  });

  it("uppercases in the input are normalised", () => {
    const next = moveMods(groups, ["FASTMAP"], "g2");
    expect(next[0].modids).toEqual(["smooth"]);
    expect(next[1].modids).toEqual(["ruins", "fastmap"]);
  });

  it("moves to ungrouped with a null target", () => {
    const next = moveMods(groups, ["smooth", "ruins"], null);
    expect(next[0].modids).toEqual(["fastmap"]);
    expect(next[1].modids).toEqual([]);
  });

  it("does not add duplicates when the target already holds the modid", () => {
    const next = moveMods(groups, ["smooth"], "g1");
    expect(next[0].modids).toHaveLength(2);
    expect(new Set(next[0].modids)).toEqual(new Set(["smooth", "fastmap"]));
  });

  it("keeps unknown modids out of every group", () => {
    const next = moveMods(groups, ["ghost"], "g2");
    expect(next[0].modids).toEqual(["smooth", "fastmap"]);
    expect(next[1].modids).toEqual(["ruins", "ghost"]);
  });

  it("does not mutate its input", () => {
    moveMods(groups, ["smooth"], "g2");
    expect(groups[0].modids).toEqual(["smooth", "fastmap"]);
  });
});

describe("reorderGroups", () => {
  it("moves a group down into the target's slot", () => {
    const next = reorderGroups(groups, "g1", "g2");
    expect(next.map((group) => group.id)).toEqual(["g2", "g1"]);
  });

  it("moves a group up into the target's slot", () => {
    const three = [...groups, { id: "g3", name: "Maps", modids: [] }];
    const next = reorderGroups(three, "g3", "g1");
    expect(next.map((group) => group.id)).toEqual(["g3", "g1", "g2"]);
  });

  it("keeps the group objects identical to the input", () => {
    const next = reorderGroups(groups, "g2", "g1");
    expect(next).toEqual([groups[1], groups[0]]);
    expect(next[0]).toBe(groups[1]);
  });

  it("returns the input for no-op moves and unknown ids", () => {
    expect(reorderGroups(groups, "g1", "g1")).toBe(groups);
    expect(reorderGroups(groups, "ghost", "g1")).toBe(groups);
    expect(reorderGroups(groups, "g1", "ghost")).toBe(groups);
  });

  it("does not mutate its input", () => {
    reorderGroups(groups, "g1", "g2");
    expect(groups.map((group) => group.id)).toEqual(["g1", "g2"]);
  });
});

describe("sectionMods", () => {
  it("keeps group order, ungrouped last, and empty groups visible", () => {
    const sections = sectionMods(groups, [mod("fastmap"), mod("ruins"), mod("loose")]);
    expect(sections.map((section) => section.group?.id ?? null)).toEqual(["g1", "g2", null]);
    expect(sections[0].mods.map((item) => item.modid)).toEqual(["fastmap"]);
    expect(sections[1].mods.map((item) => item.modid)).toEqual(["ruins"]);
    expect(sections[2].mods.map((item) => item.modid)).toEqual(["loose"]);
  });

  it("matches membership case-insensitively and keeps duplicate zips together", () => {
    const sections = sectionMods(groups, [mod("Smooth"), mod("smooth", "2.0.0"), mod("unknown")]);
    expect(sections[0].mods).toHaveLength(2);
    expect(sections[2].mods.map((item) => item.modid)).toEqual(["unknown"]);
  });

  it("ignores stale membership for mods that are not installed", () => {
    const sections = sectionMods(groups, []);
    expect(sections.every((section) => section.mods.length === 0)).toBe(true);
  });
});
