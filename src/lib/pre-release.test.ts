import { describe, expect, it } from "vitest";

import { filterPreReleaseVersions, isPreReleaseVersion, pickDefaultVersion } from "./pre-release";

describe("isPreReleaseVersion", () => {
  it("flags release candidates", () => {
    expect(isPreReleaseVersion("1.22.0-rc.1")).toBe(true);
    expect(isPreReleaseVersion("1.21.6")).toBe(false);
  });

  it("flags preview builds", () => {
    expect(isPreReleaseVersion("1.23.0-pre.1")).toBe(true);
    expect(isPreReleaseVersion("1.23.0-pre.12")).toBe(true);
  });

  it("does not flag Story Forge's client forks", () => {
    expect(isPreReleaseVersion("1.22.7+optimum")).toBe(false);
    expect(isPreReleaseVersion("1.22.7+vulkanstory")).toBe(false);
  });

  it("flags a fork built from a pre-release base", () => {
    expect(isPreReleaseVersion("1.22.0-rc.1+optimum")).toBe(true);
  });
});

describe("filterPreReleaseVersions", () => {
  it("hides release candidates unless enabled", () => {
    const versions = ["1.22.0-rc.1", "1.21.6"];

    expect(filterPreReleaseVersions(versions, false)).toEqual(["1.21.6"]);
    expect(filterPreReleaseVersions(versions, true)).toEqual(versions);
  });

  it("hides preview builds unless enabled", () => {
    const versions = ["1.23.0-pre.1", "1.22.7"];

    expect(filterPreReleaseVersions(versions, false)).toEqual(["1.22.7"]);
    expect(filterPreReleaseVersions(versions, true)).toEqual(versions);
  });

  it("leaves stable lists untouched", () => {
    const versions = ["1.21.6", "1.21.5"];
    expect(filterPreReleaseVersions(versions, false)).toEqual(versions);
  });

  it("keeps client forks of stable builds visible", () => {
    const versions = ["1.22.7+optimum", "1.22.7"];
    expect(filterPreReleaseVersions(versions, false)).toEqual(versions);
  });
});

describe("pickDefaultVersion", () => {
  it("prefers the newest stable build", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1", "1.21.6"], false)).toBe("1.21.6");
  });

  it("does not default to a preview build", () => {
    expect(pickDefaultVersion(["1.23.0-pre.1", "1.22.7"], false)).toBe("1.22.7");
  });

  it("takes the newest build when pre-releases are enabled", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1", "1.21.6"], true)).toBe("1.22.0-rc.1");
    expect(pickDefaultVersion(["1.23.0-pre.1", "1.22.7"], true)).toBe("1.23.0-pre.1");
  });

  it("falls back to release candidates when nothing else is available", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1"], false)).toBe("1.22.0-rc.1");
    expect(pickDefaultVersion([], true)).toBe("");
  });
});
