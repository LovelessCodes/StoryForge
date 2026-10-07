import { describe, expect, it } from "vitest";

import { parseDeepLink } from "./deep-link";

describe("parseDeepLink", () => {
  it("reads mod links", () => {
    expect(parseDeepLink("storyforge://install?mod=carryon")).toEqual({
      kind: "mod",
      modid: "carryon",
    });
    expect(parseDeepLink("sf://mod/carryon")).toEqual({ kind: "mod", modid: "carryon" });
    expect(parseDeepLink("sf://carryon")).toEqual({ kind: "mod", modid: "carryon" });
  });

  it("reads pack links", () => {
    expect(parseDeepLink("storyforge://install?pack=anego")).toEqual({
      kind: "pack",
      slug: "anego",
    });
    expect(parseDeepLink("storyforge://modpacks?pack=anego")).toEqual({
      kind: "pack",
      slug: "anego",
    });
    expect(parseDeepLink("storyforge://install?modpack=anego")).toEqual({
      kind: "pack",
      slug: "anego",
    });
    expect(parseDeepLink("sf://pack/anego")).toEqual({ kind: "pack", slug: "anego" });
  });

  it("decodes escaped segments", () => {
    expect(parseDeepLink("sf://pack/hello%2Dworld")).toEqual({
      kind: "pack",
      slug: "hello-world",
    });
  });

  it("prefers the pack parameter over a mod parameter", () => {
    expect(parseDeepLink("storyforge://install?mod=carryon&pack=anego")).toEqual({
      kind: "pack",
      slug: "anego",
    });
  });

  it("ignores unrelated and empty links", () => {
    expect(parseDeepLink("https://example.com/install?mod=carryon")).toBeNull();
    expect(parseDeepLink("storyforge://install")).toBeNull();
    expect(parseDeepLink("not a url")).toBeNull();
    expect(parseDeepLink("storyforge://install?pack=")).toBeNull();
    expect(parseDeepLink("sf://")).toBeNull();
  });
});
