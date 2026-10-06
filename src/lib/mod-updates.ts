import type { ModUpdate, ModUpdatesResponse } from "@/hooks/use-mod-updates";

/**
 * Whether an update release is for the game version a profile runs.
 *
 * The ModDB update feed returns each mod's newest release whatever it targets,
 * so a profile pinned to an older game version would otherwise be offered an
 * update it cannot load. Releases without game-version tags are kept — there
 * is nothing to compare against, and hiding them would lose real updates.
 */
export function updateTargetsGameVersion(update: ModUpdate, gameVersion: string): boolean {
  if (!gameVersion) return true;
  const tags = update.tags ?? [];
  if (tags.length === 0) return true;
  return tags.includes(gameVersion);
}

/**
 * Narrows an update feed to the profile's game version and the user's skipped
 * releases. `skipped` maps a lowercase modidstr to the skipped mod version.
 */
export function filterModUpdates(
  response: ModUpdatesResponse | undefined,
  gameVersion: string,
  skipped: Record<string, string>,
): ModUpdatesResponse | undefined {
  if (!response) return response;
  const skippedLower: Record<string, string> = {};
  for (const [key, version] of Object.entries(skipped)) {
    skippedLower[key.toLowerCase()] = version;
  }
  const updates: Record<string, ModUpdate> = {};
  for (const [key, update] of Object.entries(response.updates)) {
    if (!updateTargetsGameVersion(update, gameVersion)) continue;
    const skip = skippedLower[update.modidstr?.toLowerCase()];
    if (skip && skip === update.modversion) continue;
    updates[key] = update;
  }
  return { ...response, updates };
}
