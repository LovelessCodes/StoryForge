import { describe, expect, it } from "vitest";

import { relocateRecord } from "./profile-records";

describe("relocateRecord", () => {
  it("moves the entry to the new key", () => {
    expect(relocateRecord({ a: [1], b: [2] }, "a", "c")).toEqual({ b: [2], c: [1] });
  });

  it("returns the same record when the old path has nothing", () => {
    const record = { a: [1] };
    expect(relocateRecord(record, "missing", "c")).toBe(record);
  });

  it("returns the same record when the path did not change", () => {
    const record = { a: [1] };
    expect(relocateRecord(record, "a", "a")).toBe(record);
  });

  it("replaces stale data at a reused target path", () => {
    expect(relocateRecord({ a: [1], b: [2] }, "a", "b")).toEqual({ b: [1] });
  });

  it("moves empty records and keeps other paths intact", () => {
    expect(relocateRecord({ a: [], b: [3] }, "a", "c")).toEqual({ b: [3], c: [] });
  });
});
