import { describe, expect, it } from "vitest";

import { filterPreReleaseVersions, isPreReleaseVersion, pickDefaultVersion } from "./pre-release";

describe("isPreReleaseVersion", () => {
  it("flags release candidates", () => {
    expect(isPreReleaseVersion("1.22.0-rc.1")).toBe(true);
    expect(isPreReleaseVersion("1.21.6")).toBe(false);
  });
});

describe("filterPreReleaseVersions", () => {
  it("hides release candidates unless enabled", () => {
    const versions = ["1.22.0-rc.1", "1.21.6"];

    expect(filterPreReleaseVersions(versions, false)).toEqual(["1.21.6"]);
    expect(filterPreReleaseVersions(versions, true)).toEqual(versions);
  });

  it("leaves stable lists untouched", () => {
    const versions = ["1.21.6", "1.21.5"];
    expect(filterPreReleaseVersions(versions, false)).toEqual(versions);
  });
});

describe("pickDefaultVersion", () => {
  it("prefers the newest stable build", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1", "1.21.6"], false)).toBe("1.21.6");
  });

  it("takes the newest build when pre-releases are enabled", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1", "1.21.6"], true)).toBe("1.22.0-rc.1");
  });

  it("falls back to release candidates when nothing else is available", () => {
    expect(pickDefaultVersion(["1.22.0-rc.1"], false)).toBe("1.22.0-rc.1");
    expect(pickDefaultVersion([], true)).toBe("");
  });
});
