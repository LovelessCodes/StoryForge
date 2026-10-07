import type { OutputMod } from "@/lib/types";

/**
 * A named group of installed mods inside one profile.
 *
 * Membership is by lowercased modid, so a mod keeps its group across version
 * updates. A mod belongs to at most one group; mods no group names are
 * "ungrouped". Groups are purely organizational — they never change what the
 * game loads.
 */
export type ModGroup = {
  id: string;
  name: string;
  modids: string[];
};

/** One rendered section: a group with its installed mods, or the ungrouped rest. */
export type ModSection = {
  group: ModGroup | null;
  mods: OutputMod[];
};

/**
 * Removes every named modid from all groups and, when `targetId` is given,
 * adds them to that group. Returns a new array; nothing is mutated.
 */
export function moveMods(
  groups: ModGroup[],
  modids: string[],
  targetId: string | null,
): ModGroup[] {
  const moved = [...new Set(modids.map((modid) => modid.toLowerCase()))];
  const stripped = groups.map((group) => ({
    ...group,
    modids: group.modids.filter((modid) => !moved.includes(modid)),
  }));
  if (!targetId) return stripped;
  return stripped.map((group) =>
    group.id === targetId
      ? {
          ...group,
          modids: [...group.modids, ...moved.filter((modid) => !group.modids.includes(modid))],
        }
      : group,
  );
}

/**
 * Splits installed mods into their groups in group order, with the ungrouped
 * mods last. Empty groups are kept so they stay visible (and deletable).
 */
export function sectionMods(groups: ModGroup[], mods: OutputMod[]): ModSection[] {
  const groupByModid = new Map<string, ModGroup>();
  for (const group of groups) {
    for (const modid of group.modids) {
      groupByModid.set(modid.toLowerCase(), group);
    }
  }

  const sections: ModSection[] = groups.map((group) => ({ group, mods: [] }));
  const sectionById = new Map(sections.map((section) => [section.group?.id ?? "", section]));
  const ungrouped: OutputMod[] = [];

  for (const mod of mods) {
    const group = groupByModid.get(mod.modid.toLowerCase());
    const section = group ? sectionById.get(group.id) : undefined;
    if (section) section.mods.push(mod);
    else ungrouped.push(mod);
  }

  sections.push({ group: null, mods: ungrouped });
  return sections;
}
