import type { OutputMod } from "./types";

/** True when the mod (compared case-insensitively) is pinned for the profile. */
export function isModPinned(pinnedMods: string[] | undefined, modid: string): boolean {
  if (!pinnedMods || pinnedMods.length === 0) return false;
  return pinnedMods.includes(modid.toLowerCase());
}

/**
 * The `modid@version` list sent to the update check, excluding pinned mods so
 * they never appear in the updates list or "Update All".
 */
export function updateCheckParams(
  mods: OutputMod[] | undefined,
  pinnedMods: string[] | undefined,
): string {
  return (mods ?? [])
    .filter((mod) => !isModPinned(pinnedMods, mod.modid))
    .map((mod) => `${mod.modid}@${mod.version}`)
    .join(",");
}
