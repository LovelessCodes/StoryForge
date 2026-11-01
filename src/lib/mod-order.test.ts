import { describe, expect, it } from "vitest";

import type { OutputMod } from "@/lib/types";

import { orderMods, reorderSection } from "./mod-order";

function mod(modid: string, version = "1.0.0"): OutputMod {
  return {
    modid,
    name: `Mod ${modid}`,
    authors: [],
    version,
    path: `/mods/${modid}_${version}.zip`,
  };
}

const mods = [mod("alpha"), mod("bravo"), mod("charlie"), mod("delta")];

describe("orderMods", () => {
  it("keeps the incoming order when nothing is saved", () => {
    expect(orderMods(mods, [])).toBe(mods);
  });

  it("sorts listed mods first in the saved order", () => {
    const next = orderMods(mods, ["delta", "bravo"]);
    expect(next.map((item) => item.modid)).toEqual(["delta", "bravo", "alpha", "charlie"]);
  });

  it("puts mods the order does not list last, in their incoming order", () => {
    const next = orderMods(mods, ["charlie"]);
    expect(next.map((item) => item.modid)).toEqual(["charlie", "alpha", "bravo", "delta"]);
  });

  it("matches case-insensitively", () => {
    const next = orderMods([mod("Alpha"), mod("bravo")], ["BRAVO", "alpha"]);
    expect(next.map((item) => item.modid)).toEqual(["bravo", "Alpha"]);
  });

  it("does not mutate the incoming list", () => {
    orderMods(mods, ["delta"]);
    expect(mods.map((item) => item.modid)).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });
});

describe("reorderSection", () => {
  it("moves a mod down inside its section and keeps other slots", () => {
    const order = ["alpha", "bravo", "charlie", "delta"];
    const next = reorderSection(order, ["alpha", "bravo"], "alpha", "bravo");
    expect(next).toEqual(["bravo", "alpha", "charlie", "delta"]);
  });

  it("moves a mod up inside its section", () => {
    const order = ["alpha", "bravo", "charlie"];
    const next = reorderSection(order, ["alpha", "bravo", "charlie"], "charlie", "alpha");
    expect(next).toEqual(["charlie", "alpha", "bravo"]);
  });

  it("leaves the slots of other sections alone", () => {
    const order = ["alpha", "bravo", "charlie", "delta"];
    const next = reorderSection(order, ["alpha", "charlie"], "charlie", "alpha");
    expect(next).toEqual(["charlie", "bravo", "alpha", "delta"]);
  });

  it("appends section mods the saved order does not know yet", () => {
    const next = reorderSection(["alpha"], ["alpha", "bravo", "charlie"], "charlie", "bravo");
    expect(next).toEqual(["alpha", "charlie", "bravo"]);
  });

  it("returns the saved order unchanged for unknown ids and no-op moves", () => {
    expect(reorderSection(["alpha", "bravo"], ["alpha", "bravo"], "ghost", "alpha")).toEqual([
      "alpha",
      "bravo",
    ]);
    expect(reorderSection(["alpha", "bravo"], ["alpha", "bravo"], "alpha", "alpha")).toEqual([
      "alpha",
      "bravo",
    ]);
  });

  it("normalises case and drops duplicate ids", () => {
    const next = reorderSection(["ALPHA", "alpha", "bravo"], ["ALPHA", "bravo"], "bravo", "alpha");
    expect(next).toEqual(["bravo", "alpha"]);
  });

  it("does not mutate its inputs", () => {
    const order = ["alpha", "bravo"];
    const section = ["alpha", "bravo"];
    reorderSection(order, section, "bravo", "alpha");
    expect(order).toEqual(["alpha", "bravo"]);
    expect(section).toEqual(["alpha", "bravo"]);
  });
});
