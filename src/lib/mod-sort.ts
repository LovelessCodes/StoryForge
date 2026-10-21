import { stripped } from "@/lib/helpers";

/** Fields of a mod that relevance ranking reads. */
export type RankableMod = {
  name: string;
  summary: string;
  tags: string[];
};

/** A mod's rankable fields in the form the matchers compare against. */
type NormalizedMod = {
  name: string;
  summary: string;
  tags: string;
};

const normalizedCache = new WeakMap<RankableMod, NormalizedMod>();

/**
 * The lower-cased, punctuation-free form of a mod's rankable fields, built once
 * per mod object. Ranking runs inside a sort comparator over the whole catalog,
 * so normalising there rebuilds the same strings ~100k times per sort.
 *
 * The tags are kept as one newline-fenced string. Joining them plainly would
 * let a query match across two names ("stor" + "aged" would match "storage"),
 * and `stripped()` collapses whitespace to single spaces, so the fence can
 * occur neither in a tag nor in the query. Every hit therefore lies inside a
 * single tag, which is the same result as checking each tag on its own.
 */
function normalize(mod: RankableMod): NormalizedMod {
  const cached = normalizedCache.get(mod);
  if (cached) return cached;

  const normalized = {
    name: stripped(mod.name),
    summary: stripped(mod.summary),
    tags: mod.tags.map((tag) => `\n${stripped(tag)}\n`).join(""),
  };
  normalizedCache.set(mod, normalized);
  return normalized;
}

/** The normalized name, for name sorting without re-normalising per comparison. */
export function normalizedName(mod: RankableMod): string {
  return normalize(mod).name;
}

function rankNormalized(mod: NormalizedMod, query: string): number {
  if (!query) return 5;
  if (mod.name === query) return 0;
  if (mod.name.startsWith(query)) return 1;
  if (mod.name.includes(query)) return 2;
  if (mod.tags.includes(query)) return 3;
  if (mod.summary.includes(query)) return 4;
  return 5;
}

/**
 * A ranker bound to one query. Sorting calls the ranker inside its comparator,
 * so the query is normalised once here instead of on every comparison.
 */
export function relevanceRanker(query: string): (mod: RankableMod) => number {
  const normalizedQuery = stripped(query);
  return (mod) => rankNormalized(normalize(mod), normalizedQuery);
}

/** Ranks match quality: exact name > name starts-with > name contains > tag match > description match. */
export function relevanceRank(mod: RankableMod, query: string): number {
  return relevanceRanker(query)(mod);
}

/** Sort keys for the mod browser list. */
export type SortBy =
  | "relevance"
  | "created"
  | "name"
  | "trending"
  | "downloads"
  | "follows"
  | "comments"
  | "updated";

export const sortOptions: Record<SortBy, string> = {
  comments: "Comments",
  created: "Created",
  downloads: "Downloads",
  follows: "Follows",
  name: "Name",
  relevance: "Relevance",
  trending: "Trending",
  updated: "Last Updated",
};
