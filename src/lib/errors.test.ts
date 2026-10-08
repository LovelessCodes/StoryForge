import { describe, expect, it } from "vitest";

import { errorInfo, errorMessage } from "./errors";

describe("errorMessage", () => {
  it("reads strings, Errors and Tauri rejection objects", () => {
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ name: "io_error", message: "disk full" })).toBe("disk full");
    expect(errorMessage({ message: "only message" })).toBe("only message");
  });

  it("never renders [object Object]", () => {
    expect(errorMessage({ name: "odd" })).toBe('{"name":"odd"}');
    expect(errorMessage({})).toBe("{}");
  });

  it("still stringifies primitives", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
  });
});

describe("errorInfo", () => {
  it("carries the login pre-challenge payload", () => {
    const info = errorInfo({
      name: "prelogin_required",
      message: "requiretotpcode",
      prelogintoken: "token-123",
    });
    expect(info).toEqual({
      message: "requiretotpcode",
      name: "prelogin_required",
      prelogintoken: "token-123",
    });
  });

  it("leaves absent fields undefined", () => {
    expect(errorInfo("plain")).toEqual({
      message: "plain",
      name: undefined,
      prelogintoken: undefined,
    });
  });
});
