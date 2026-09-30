import { describe, expect, it, vi } from "vitest";

// mod-sort -> utils reads the platform at import time via the Tauri OS plugin.
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "macos" }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { relevanceRank } from "./mod-sort";

const mod = (overrides: Partial<Parameters<typeof relevanceRank>[0]> = {}) => ({
  name: "Chisel Tools",
  summary: "Adds chisels.",
  tags: [],
  ...overrides,
});

describe("relevanceRank", () => {
  it("prefers exact and prefix name matches over the rest", () => {
    expect(relevanceRank(mod({ name: "Storage" }), "storage")).toBe(0);
    expect(relevanceRank(mod({ name: "Storage Drawers" }), "storage")).toBe(1);
    expect(relevanceRank(mod({ name: "Big Storage Drawers" }), "storage")).toBe(2);
    expect(relevanceRank(mod({ tags: ["Storage"] }), "storage")).toBe(3);
    expect(relevanceRank(mod({ summary: "Storage for everyone." }), "storage")).toBe(4);
    expect(relevanceRank(mod(), "storage")).toBe(5);
  });

  it("matches tags by substring, ignoring case and punctuation", () => {
    expect(relevanceRank(mod({ tags: ["QoL"] }), "q.o.l")).toBe(3);
    expect(relevanceRank(mod({ tags: ["Storage"] }), "stor")).toBe(3);
    expect(relevanceRank(mod({ tags: ["Worldgen"] }), "gen")).toBe(3);
    // Case and surrounding whitespace are stripped before matching.
    expect(relevanceRank(mod({ tags: ["Worldgen"] }), " WorldGen ")).toBe(3);
  });

  it("does not let a query match across two tag names", () => {
    // "storageaged" fits across "Storage" + "Aged"; a single joined haystack
    // would match it, the fenced search per tag must not.
    expect(relevanceRank(mod({ tags: ["Storage", "Aged"] }), "storageaged")).toBe(5);
    expect(relevanceRank(mod({ tags: ["Stor", "Aged"] }), "storage")).toBe(5);
  });

  it("returns the no-match rank for an empty or blank query", () => {
    expect(relevanceRank(mod({ name: "Storage" }), "")).toBe(5);
    expect(relevanceRank(mod({ name: "Storage" }), "   ")).toBe(5);
    expect(relevanceRank(mod({ name: "Storage" }), "!!!")).toBe(5);
  });
});
