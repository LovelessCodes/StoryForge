import { describe, expect, it } from "vitest";

import { gameDefaultsCounts } from "./game-defaults";

describe("gameDefaultsCounts", () => {
  it("counts key bindings and pooled settings separately", () => {
    expect(
      gameDefaultsCounts({
        keyMapping: { sprint: {}, inventory: {} },
        intSettings: { viewDistance: 256 },
        boolSettings: { bloom: true, vsync: false },
        floatSettings: { gammaLevel: 1 },
        stringSettings: { language: "en" },
        // Meta fields are not settings and must not be counted.
        capturedAt: 123,
        sourceProfile: "Main",
        includesAccount: true,
      }),
    ).toEqual({ keyBindings: 2, settings: 5 });
  });

  it("handles an empty snapshot", () => {
    expect(gameDefaultsCounts({})).toEqual({ keyBindings: 0, settings: 0 });
  });
});
