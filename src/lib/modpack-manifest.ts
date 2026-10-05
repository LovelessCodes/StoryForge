import type { OutputMod } from "./types";

/** One line of a RiftLauncher-compatible modpack manifest. */
export type ModpackManifestMod = {
  modid: string;
  version: string;
  /** Display name of the copy the pack was exported from; never an identifier. */
  name?: string;
};

/**
 * The RiftLauncher / VS Launcher "Export Modpack" file. Packs may carry
 * `servers` and `settings` blocks; the Rust reader ignores unknown fields, so
 * only what an import acts on is modeled here.
 */
export type ModpackManifest = {
  name: string;
  gameVersion: string;
  mods: ModpackManifestMod[];
};

/** What importing one line would do, based on the profile's installed mods. */
export type ImportEntryStatus =
  | { kind: "new" }
  | { kind: "same"; installed: OutputMod }
  | { kind: "replace"; installed: OutputMod };

export type ImportPlanEntry = {
  entry: ModpackManifestMod;
  status: ImportEntryStatus;
};

function modidKey(modid: string): string {
  return modid.trim().toLowerCase();
}

/**
 * Status of every manifest line against the installed mods. Matched
 * case-insensitively: ModDB ids are lowercase, but hand-edited packs and
 * `modinfo.json` copies are not.
 */
export function planImport(
  manifest: ModpackManifest,
  installedMods: OutputMod[],
): ImportPlanEntry[] {
  const byModid = new Map<string, OutputMod>();
  for (const mod of installedMods) byModid.set(modidKey(mod.modid), mod);

  return manifest.mods.map((entry) => {
    const installed = byModid.get(modidKey(entry.modid));
    if (!installed) return { entry, status: { kind: "new" } };
    if (installed.version === entry.version) return { entry, status: { kind: "same", installed } };
    return { entry, status: { kind: "replace", installed } };
  });
}

/** Build the manifest an export writes from a profile's installed mods. */
export function buildManifest(
  name: string,
  gameVersion: string,
  installedMods: OutputMod[],
): ModpackManifest {
  return {
    name,
    gameVersion,
    mods: installedMods.map((mod) => ({
      modid: mod.modid,
      version: mod.version,
      name: mod.name,
    })),
  };
}

/** Default file name for an export; path-hostile characters become `_`. */
export function manifestFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control chars are path-hostile too
  const base = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  return `${base || "modpack"}.json`;
}
