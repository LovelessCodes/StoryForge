import { pathBasename } from "@/lib/helpers";
import type { World } from "@/lib/types";
import type { Profile } from "@/stores/profiles";

/**
 * Resolve the profile a world belongs to.
 *
 * `world.profile_name` is the profile *folder* name on disk, not the display
 * name, so it has to be matched against the basename of the profile path.
 */
export function findWorldProfile(profiles: Profile[], world: World): Profile | undefined {
  return profiles.find((profile) => pathBasename(profile.path) === world.profile_name);
}

/** The save name passed to `play_game` — the world file stem without `.vcdbs`. */
export function worldSaveName(world: World): string {
  return pathBasename(world.path).replace(/\.vcdbs$/i, "");
}
