import { describe, expect, it } from "vitest";

import { clampTextScale, scalePixels, TEXT_SCALE_DEFAULT } from "./text-scale";

describe("clampTextScale", () => {
  it("keeps values inside the offered range", () => {
    expect(clampTextScale(100)).toBe(100);
    expect(clampTextScale(100.4)).toBe(100);
    expect(clampTextScale(20)).toBe(80);
    expect(clampTextScale(500)).toBe(150);
  });

  it("falls back to the default for unusable values", () => {
    expect(clampTextScale(Number.NaN)).toBe(TEXT_SCALE_DEFAULT);
    expect(clampTextScale(Number.POSITIVE_INFINITY)).toBe(TEXT_SCALE_DEFAULT);
    expect(clampTextScale(Number.NEGATIVE_INFINITY)).toBe(TEXT_SCALE_DEFAULT);
  });
});

describe("scalePixels", () => {
  it("maps the percentage onto a base pixel size", () => {
    expect(scalePixels(16, 100)).toBe(16);
    expect(scalePixels(16, 150)).toBe(24);
    expect(scalePixels(16, 80)).toBeCloseTo(12.8);
    expect(scalePixels(13, 120)).toBeCloseTo(15.6);
  });

  it("clamps before scaling", () => {
    expect(scalePixels(16, 1000)).toBe(24);
  });
});
