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

  it("reads ModDB 1-click install links", () => {
    expect(parseDeepLink("vintagestorymodinstall://carryon@1.14.3")).toEqual({
      kind: "mod",
      modid: "carryon",
      version: "1.14.3",
    });
    expect(parseDeepLink("vintagestorymodinstall://modmenu@2.0.0-rc.1")).toEqual({
      kind: "mod",
      modid: "modmenu",
      version: "2.0.0-rc.1",
    });
    // Two-part versions must not be read as an IPv4 shorthand.
    expect(parseDeepLink("vintagestorymodinstall://examplemod@1.14")).toEqual({
      kind: "mod",
      modid: "examplemod",
      version: "1.14",
    });
    expect(parseDeepLink("vintagestorymodinstall://carryon@1.14.3/")).toEqual({
      kind: "mod",
      modid: "carryon",
      version: "1.14.3",
    });
    expect(parseDeepLink("vintagestorymodinstall://hello%2Dmod@1.0.0")).toEqual({
      kind: "mod",
      modid: "hello-mod",
      version: "1.0.0",
    });
    // The version is optional.
    expect(parseDeepLink("vintagestorymodinstall://carryon")).toEqual({
      kind: "mod",
      modid: "carryon",
    });
  });

  it("reads the version parameter on storyforge links", () => {
    expect(parseDeepLink("storyforge://install?mod=carryon&version=1.14.3")).toEqual({
      kind: "mod",
      modid: "carryon",
      version: "1.14.3",
    });
    expect(parseDeepLink("sf://carryon?version=1.0.0")).toEqual({
      kind: "mod",
      modid: "carryon",
      version: "1.0.0",
    });
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
    expect(parseDeepLink("vintagestorymodinstall:")).toBeNull();
    expect(parseDeepLink("vintagestorymodinstall://")).toBeNull();
    expect(parseDeepLink("vintagestorymodinstall://@1.14.3")).toBeNull();
  });
});
