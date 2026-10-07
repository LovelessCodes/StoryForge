import { stripped } from "@/lib/helpers";

/** Fields of a mod that relevance ranking reads. */
export type RankableMod = {
  name: string;
  summary: string;
  tags: string[];
};

/**
 * True when the stripped query occurs inside one of the stripped tag names.
 *
 * The tags are searched as one newline-fenced string. Searching them joined
 * plainly would let a query match across two names ("stor" + "aged" would
 * match "storage"), and `stripped()` collapses whitespace to single spaces,
 * so the fence can occur neither in a tag nor in the query. Every hit
 * therefore lies inside a single tag, which is the same result as checking
 * each tag on its own.
 */
function tagsContainQuery(tags: string[], query: string): boolean {
  const haystack = tags.map((tag) => `\n${stripped(tag)}\n`).join("");
  return haystack.includes(query);
}

/** Ranks match quality: exact name > name starts-with > name contains > tag match > description match. */
export function relevanceRank(mod: RankableMod, query: string): number {
  const q = stripped(query);
  if (!q) return 5;
  const name = stripped(mod.name);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (tagsContainQuery(mod.tags, q)) return 3;
  if (stripped(mod.summary).includes(q)) return 4;
  return 5;
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
