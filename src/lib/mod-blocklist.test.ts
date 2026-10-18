import { describe, expect, it } from "vitest";

import {
  authorKey,
  blockedAuthorSet,
  excludeBlockedAuthors,
  isAuthorBlocked,
  toggleBlockedAuthor,
} from "./mod-blocklist";
import type { Mod } from "./types";

const mod = (author: string, name = author): Mod => ({
  modid: 1,
  assetid: 1,
  downloads: 0,
  follows: 0,
  trendingpoints: 0,
  comments: 0,
  name,
  summary: "",
  modidstrs: [name],
  author,
  urlalias: null,
  side: "both",
  type: "mod",
  logo: null,
  tags: [],
  lastreleased: "2026-01-01",
});

describe("authorKey", () => {
  it("trims and lowercases", () => {
    expect(authorKey("  Macheim ")).toBe("macheim");
  });
});

describe("isAuthorBlocked", () => {
  it("matches case-insensitively", () => {
    expect(isAuthorBlocked(["Macheim"], "macheim")).toBe(true);
    expect(isAuthorBlocked(["Macheim"], "Macheim")).toBe(true);
    expect(isAuthorBlocked(["Macheim"], "Other")).toBe(false);
    expect(isAuthorBlocked([], "Macheim")).toBe(false);
  });
});

describe("toggleBlockedAuthor", () => {
  it("adds an unknown author", () => {
    expect(toggleBlockedAuthor([], "Macheim")).toEqual(["Macheim"]);
    expect(toggleBlockedAuthor(["Other"], "Macheim")).toEqual(["Other", "Macheim"]);
  });

  it("removes a blocked author regardless of case and padding", () => {
    expect(toggleBlockedAuthor(["Macheim", "Other"], "  macheim ")).toEqual(["Other"]);
  });

  it("ignores an empty author", () => {
    expect(toggleBlockedAuthor(["Other"], "   ")).toEqual(["Other"]);
  });
});

describe("blockedAuthorSet", () => {
  it("lowercases every entry", () => {
    expect([...blockedAuthorSet(["Macheim", "OTHER"])]).toEqual(["macheim", "other"]);
  });
});

describe("excludeBlockedAuthors", () => {
  it("drops mods by blocked authors, case-insensitively", () => {
    const mods = [mod("Macheim"), mod("Raven"), mod("macheim", "Second by Macheim")];
    expect(excludeBlockedAuthors(mods, blockedAuthorSet(["macheim"]))).toEqual([mod("Raven")]);
  });

  it("returns the input untouched when nothing is blocked", () => {
    const mods = [mod("Macheim")];
    expect(excludeBlockedAuthors(mods, blockedAuthorSet([]))).toBe(mods);
  });
});
