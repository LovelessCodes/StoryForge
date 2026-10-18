import type { Mod } from "./types";

/**
 * Author names are free-form strings from the Mod Database, so the blocklist
 * matches them case-insensitively and ignores surrounding whitespace.
 */
export const authorKey = (author: string) => author.trim().toLowerCase();

/** Whether an author is on the blocklist. */
export function isAuthorBlocked(blockedAuthors: readonly string[], author: string): boolean {
  const key = authorKey(author);
  return key.length > 0 && blockedAuthors.some((entry) => authorKey(entry) === key);
}

/** Adds an author to the blocklist, or removes it when already blocked. */
export function toggleBlockedAuthor(blockedAuthors: string[], author: string): string[] {
  const name = author.trim();
  if (!name) return blockedAuthors;
  return isAuthorBlocked(blockedAuthors, name)
    ? blockedAuthors.filter((entry) => authorKey(entry) !== authorKey(name))
    : [...blockedAuthors, name];
}

/** Lowercased author names as a set, for O(1) lookups while filtering. */
export function blockedAuthorSet(blockedAuthors: readonly string[]): Set<string> {
  return new Set(blockedAuthors.map(authorKey));
}

/** Leaves out the mods whose author is blocked. */
export function excludeBlockedAuthors(mods: Mod[], blocked: ReadonlySet<string>): Mod[] {
  if (blocked.size === 0) return mods;
  return mods.filter((mod) => !blocked.has(authorKey(mod.author)));
}
