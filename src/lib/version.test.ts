import { describe, expect, it } from "vitest";

import { isNewerVersion } from "./version";

describe("isNewerVersion", () => {
  it("compares each dotted part numerically", () => {
    expect(isNewerVersion("2.0.11", "2.0.9")).toBe(true);
    expect(isNewerVersion("2.1.0", "2.0.99")).toBe(true);
    expect(isNewerVersion("3.0.0", "2.99.99")).toBe(true);
  });

  it("is false for the same or an older release", () => {
    expect(isNewerVersion("2.0.11", "2.0.11")).toBe(false);
    expect(isNewerVersion("2.0.9", "2.0.11")).toBe(false);
    expect(isNewerVersion("1.99.0", "2.0.0")).toBe(false);
  });

  it("ignores a pre-release suffix", () => {
    expect(isNewerVersion("2.0.12-rc.1", "2.0.11")).toBe(true);
    expect(isNewerVersion("2.0.11-rc.1", "2.0.11")).toBe(false);
  });

  it("treats missing parts as zero", () => {
    expect(isNewerVersion("2.1", "2.0.9")).toBe(true);
    expect(isNewerVersion("2.0", "2.0.0")).toBe(false);
  });
});
