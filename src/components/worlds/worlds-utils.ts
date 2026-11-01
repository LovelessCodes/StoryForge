import type { MapEntry } from "@/hooks/use-world-map";
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

/** Maps that do not belong to any world save, so they get their own list. */
export function standaloneMaps(maps: MapEntry[], worlds: World[]): MapEntry[] {
  const saveIds = new Set(
    worlds
      .filter((world) => world.has_map && world.data.savegame_identifier)
      .map((world) => world.data.savegame_identifier),
  );
  return maps.filter((map) => !saveIds.has(map.name));
}

function lastPlayedTime(world: World): number {
  return world.data.last_played ? new Date(world.data.last_played).getTime() : 0;
}

/**
 * Worlds matching an already normalized search and a profile filter, most
 * recently played first. A null profile means every profile.
 */
export function filterWorlds(
  worlds: World[],
  profiles: Profile[],
  search: string,
  profileId: number | null,
): World[] {
  return worlds
    .filter((world) => {
      if (!world.data.world_name.toLowerCase().includes(search)) return false;
      return profileId === null || findWorldProfile(profiles, world)?.id === profileId;
    })
    .toSorted((a, b) => lastPlayedTime(b) - lastPlayedTime(a));
}

/** Maps matching an already normalized search and a profile filter. */
export function filterMaps(maps: MapEntry[], search: string, profileId: number | null): MapEntry[] {
  return maps.filter((map) => {
    if (!map.name.toLowerCase().includes(search)) return false;
    return profileId === null || map.profile_id === profileId;
  });
}
