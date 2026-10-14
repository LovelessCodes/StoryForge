/**
 * Parsing for Story Forge / SF deep links.
 *
 * Three things a link can ask for:
 *
 * - a mod to install — `storyforge://install?mod=<id>`, `sf://mod/<id>`,
 *   `sf://<id>`, optionally pinned with `?version=<release>`
 * - a ModDB 1-click install — `vintagestorymodinstall://<id>@<release>`, the
 *   button on mods.vintagestory.at
 * - a modpack to open — `storyforge://install?pack=<slug>`,
 *   `storyforge://modpacks?pack=<slug>`, `sf://pack/<slug>`
 *
 * The parser is total: anything it does not recognise answers `null` and
 * callers treat that as a no-op. Query parameters win over path forms, so the
 * unambiguous spelling is available when a host happens to look like an id.
 */

export type DeepLink =
  | { kind: "mod"; modid: string; version?: string }
  | { kind: "pack"; slug: string };

const PACK_HOSTS = new Set(["pack", "modpack"]);
const MOD_HOSTS = new Set(["mod", "mods"]);
/** The protocol ModDB's 1-click install button uses. */
const MOD_INSTALL_SCHEME = "vintagestorymodinstall:";

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Reads `<modid>@<version>` (version optional, in case the site ever drops
 * it) from the raw text after the scheme. `new URL` cannot be trusted here:
 * it trims the mod id into the userinfo and turns a two-part version such as
 * `1.14` into the equivalent IPv4 address.
 */
function parseModInstallLink(raw: string): DeepLink | null {
  const authority = raw.replace(/^\/+/, "").split(/[/?#]/, 1)[0] ?? "";
  const at = authority.indexOf("@");
  const modid = decodeSegment(at === -1 ? authority : authority.slice(0, at)).trim();
  if (!modid) return null;
  const version = at === -1 ? "" : decodeSegment(authority.slice(at + 1)).trim();
  return version ? { kind: "mod", modid, version } : { kind: "mod", modid };
}

export function parseDeepLink(url: string): DeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === MOD_INSTALL_SCHEME) {
    return parseModInstallLink(url.slice(MOD_INSTALL_SCHEME.length));
  }
  if (parsed.protocol !== "storyforge:" && parsed.protocol !== "sf:") return null;

  const packParam = (parsed.searchParams.get("pack") ?? parsed.searchParams.get("modpack"))?.trim();
  if (packParam) return { kind: "pack", slug: packParam };

  const segments = parsed.pathname.split("/").filter(Boolean).map(decodeSegment);
  const host = parsed.hostname.trim().toLowerCase();

  // `sf://pack/<slug>` and `sf://<slug>`-style paths.
  if (PACK_HOSTS.has(host) && segments[0]) return { kind: "pack", slug: segments[0] };
  if (PACK_HOSTS.has(segments[0]) && segments[1]) return { kind: "pack", slug: segments[1] };

  const versionParam = parsed.searchParams.get("version")?.trim();
  const mod = (modid: string): DeepLink =>
    versionParam ? { kind: "mod", modid, version: versionParam } : { kind: "mod", modid };

  const modParam = parsed.searchParams.get("mod")?.trim();
  if (modParam) return mod(modParam);

  // `sf://mod/<id>` and the bare `sf://<id>` form, where the id is the host.
  if (MOD_HOSTS.has(host) && segments[0]) return mod(segments[0]);
  const hostId = parsed.hostname.trim();
  if (hostId && hostId !== "install" && segments.length === 0) {
    return mod(hostId);
  }
  if (segments[0]) return mod(segments[0]);
  return null;
}
