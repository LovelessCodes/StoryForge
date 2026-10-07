/**
 * Parsing for Story Forge / SF deep links.
 *
 * Two things a link can ask for:
 *
 * - a mod to install — `storyforge://install?mod=<id>`, `sf://mod/<id>`,
 *   `sf://<id>`
 * - a modpack to open — `storyforge://install?pack=<slug>`,
 *   `storyforge://modpacks?pack=<slug>`, `sf://pack/<slug>`
 *
 * The parser is total: anything it does not recognise answers `null` and
 * callers treat that as a no-op. Query parameters win over path forms, so the
 * unambiguous spelling is available when a host happens to look like an id.
 */

export type DeepLink = { kind: "mod"; modid: string } | { kind: "pack"; slug: string };

const PACK_HOSTS = new Set(["pack", "modpack"]);
const MOD_HOSTS = new Set(["mod", "mods"]);

export function parseDeepLink(url: string): DeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "storyforge:" && parsed.protocol !== "sf:") return null;

  const packParam = (parsed.searchParams.get("pack") ?? parsed.searchParams.get("modpack"))?.trim();
  if (packParam) return { kind: "pack", slug: packParam };

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  const host = parsed.hostname.trim().toLowerCase();

  // `sf://pack/<slug>` and `sf://<slug>`-style paths.
  if (PACK_HOSTS.has(host) && segments[0]) return { kind: "pack", slug: segments[0] };
  if (PACK_HOSTS.has(segments[0]) && segments[1]) return { kind: "pack", slug: segments[1] };

  const modParam = parsed.searchParams.get("mod")?.trim();
  if (modParam) return { kind: "mod", modid: modParam };

  // `sf://mod/<id>` and the bare `sf://<id>` form, where the id is the host.
  if (MOD_HOSTS.has(host) && segments[0]) return { kind: "mod", modid: segments[0] };
  const hostId = parsed.hostname.trim();
  if (hostId && hostId !== "install" && segments.length === 0) {
    return { kind: "mod", modid: hostId };
  }
  if (segments[0]) return { kind: "mod", modid: segments[0] };
  return null;
}
