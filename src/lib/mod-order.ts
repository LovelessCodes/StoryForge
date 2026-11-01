import type { OutputMod } from "@/lib/types";

/**
 * User-chosen order of installed mods, by lowercased modid.
 *
 * The order is a preference, not part of the profile: the game loads the same
 * mods either way. It only covers mods the user has dragged; anything else
 * keeps the order the mods came in and follows the listed ones.
 */

/** Lowercases and de-duplicates an order, keeping the first position of each id. */
function normalize(order: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of order) {
    const id = entry.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Sorts installed mods into the saved order. Mods the order does not mention
 * keep their incoming order and come after the listed ones, so a freshly
 * installed mod appears at the end of its section instead of jumping around.
 */
export function orderMods(mods: OutputMod[], order: string[]): OutputMod[] {
  const saved = normalize(order);
  if (saved.length === 0) return mods;
  const rank = new Map(saved.map((id, index) => [id, index]));
  return mods
    .map((mod, index) => ({ index, mod, rank: rank.get(mod.modid.toLowerCase()) ?? saved.length }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.mod);
}

/**
 * Moves `activeId` into `overId`'s slot among the mods of one section, and
 * returns the saved order with the section's modids rearranged in place.
 *
 * Only the slots the section already occupies change, so the order of every
 * other section is left untouched. Modids the saved order does not know are
 * appended in their current section order first.
 */
export function reorderSection(
  order: string[],
  section: string[],
  activeId: string,
  overId: string,
): string[] {
  const saved = normalize(order);
  const sectionIds = normalize(section);
  const sectionSet = new Set(sectionIds);
  for (const id of sectionIds) {
    if (!saved.includes(id)) saved.push(id);
  }

  const from = sectionIds.indexOf(activeId.toLowerCase());
  const to = sectionIds.indexOf(overId.toLowerCase());
  if (from === -1 || to === -1 || from === to) return saved;

  const reordered = [...sectionIds];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  const slots: number[] = [];
  for (const [index, id] of saved.entries()) {
    if (sectionSet.has(id)) slots.push(index);
  }
  for (const [index, slot] of slots.entries()) {
    saved[slot] = reordered[index];
  }
  return saved;
}
