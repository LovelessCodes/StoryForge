import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { baseGameVersion, pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

import { AddModSheet } from "./AddModSheet";
import BrokenModsBanner from "./BrokenModsBanner";
import MissingDependenciesBanner from "./MissingDependenciesBanner";
import { ModFiltersBar } from "./ModFiltersBar";
import { ModList } from "./ModList";
import { RemoveModSheet } from "./RemoveModSheet";
import { StandaloneInstallPickerSheet } from "./StandaloneInstallPickerSheet";
import { UpdateModSheet } from "./UpdateModSheet";
import { useModFilters, useModsData } from "./use-mods-data";

export type ModsPageProps = {
  /**
   * Profile root to manage instead of the active profile (e.g. a hosted
   * server's data dir). Installing/updating/removing then targets this path.
   */
  targetPath?: string;
  /** Human label for the target shown where the folder basename used to be. */
  targetLabel?: string;
  /** Pinned game version of the target, used when exporting a modpack. */
  targetVersion?: string;
};

type SheetRequest =
  | { kind: "add"; mod: Mod }
  | { kind: "update"; mod: Mod; installedMod: OutputMod }
  | { kind: "remove"; mod: Mod; installedMod: OutputMod }
  | { kind: "standalone"; mod: Mod };

export default function ModsPage({ targetPath, targetLabel, targetVersion }: ModsPageProps) {
  const { t } = useTranslation();
  const { activeProfile } = useActiveProfile();
  const defaultModSortBy = useSettingsStore((s) => s.defaultModSortBy);
  const filters = useModFilters(defaultModSortBy);

  // The profile root (not the Mods subdir) is what the installed-mods and
  // update commands expect.
  const profilePath = targetPath ?? activeProfile?.path;
  const destinationLabel =
    targetLabel ??
    (targetPath ? pathBasename(targetPath) : (activeProfile?.name ?? t("mods.standalone")));
  const gameVersion = baseGameVersion(targetVersion ?? activeProfile?.version ?? "");

  const data = useModsData({
    author: filters.author,
    category: filters.category,
    favoritesOnly: filters.favoritesOnly,
    modsDirectory: profilePath,
    orderDirection: filters.orderDirection,
    profileGameVersion: gameVersion,
    searchText: filters.searchText,
    selectedGameVersions: filters.selectedGameVersions,
    selectedModTags: filters.selectedModTags,
    side: filters.side,
    sortBy: filters.sortBy,
  });

  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openSheet = (request: SheetRequest) => {
    setSheet(request);
    setSheetOpen(true);
  };

  // A deep link (`storyforge://install?mod=…`) queued a mod id; open the add
  // sheet for it once this page is mounted.
  const pendingDeepLinkMod = useSettingsStore((s) => s.pendingDeepLinkMod);
  const setPendingDeepLinkMod = useSettingsStore((s) => s.setPendingDeepLinkMod);
  useEffect(() => {
    const modid = pendingDeepLinkMod;
    if (!modid) return;
    setPendingDeepLinkMod(null);
    void (async () => {
      try {
        const info = await invoke<ModInfo>("fetch_mod_info", { modid });
        const mod: Mod = {
          assetid: info.mod.assetid,
          author: info.mod.author,
          comments: info.mod.comments,
          downloads: info.mod.downloads,
          follows: info.mod.follows,
          lastreleased: info.mod.lastreleased,
          logo: info.mod.logofile,
          modid: info.mod.modid,
          modidstrs: [modid],
          name: info.mod.name,
          side: info.mod.side,
          summary: (info.mod.text ?? "").slice(0, 240),
          tags: info.mod.tags,
          trendingpoints: info.mod.trendingpoints,
          type: info.mod.type,
          urlalias: info.mod.urlalias ?? null,
        };
        openSheet(profilePath ? { kind: "add", mod } : { kind: "standalone", mod });
      } catch (error) {
        toast.error(t("mods.deepLink.failed", { modid }), { description: String(error) });
      }
    })();
    // Consumed once per queued id; the sheet state is local to this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeepLinkMod]);

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <ModFiltersBar
          destinationLabel={destinationLabel}
          filters={filters}
          gameVersion={gameVersion}
          gameVersions={data.gameVersions}
          instMods={data.instMods}
          modCount={data.modsList.length}
          modsDirectory={profilePath}
          modTags={data.modTags}
          modUpdates={data.modUpdates}
        />
        {profilePath && (
          <MissingDependenciesBanner
            destinationLabel={destinationLabel}
            missing={data.missingDependencies}
            modsDirectory={profilePath}
          />
        )}
        {profilePath && (
          <BrokenModsBanner
            destinationLabel={destinationLabel}
            duplicates={data.duplicateMods}
            errors={data.modErrors}
            modsDirectory={profilePath}
          />
        )}
        <ModList
          destinationLabel={destinationLabel}
          installedMods={profilePath ? (data.instMods?.mods ?? []) : []}
          mods={data.modsList}
          modsDirectory={profilePath}
          modUpdates={profilePath ? data.modUpdates : undefined}
          onAdd={(mod) => openSheet({ kind: "add", mod })}
          onAuthorClick={filters.setAuthor}
          onRemove={(mod, installedMod) => openSheet({ kind: "remove", mod, installedMod })}
          onStandaloneInstall={(mod) => openSheet({ kind: "standalone", mod })}
          onTagClick={filters.handleTagClick}
          onUpdate={(mod, installedMod) => openSheet({ kind: "update", mod, installedMod })}
          selectedTagNames={filters.selectedTagNames}
          tagByName={data.tagByName}
          tagColorMap={data.tagColorMap}
        />
      </div>

      {sheet?.kind === "add" && profilePath && (
        <AddModSheet
          destinationLabel={destinationLabel}
          key={sheet.mod.modid}
          mod={sheet.mod}
          modsDirectory={profilePath}
          onOpenChange={setSheetOpen}
          open={sheetOpen}
        />
      )}
      {sheet?.kind === "update" && profilePath && (
        <UpdateModSheet
          destinationLabel={destinationLabel}
          installedMod={sheet.installedMod}
          key={sheet.mod.modid}
          mod={sheet.mod}
          modsDirectory={profilePath}
          onOpenChange={setSheetOpen}
          open={sheetOpen}
        />
      )}
      {sheet?.kind === "remove" && profilePath && (
        <RemoveModSheet
          destinationLabel={destinationLabel}
          key={sheet.mod.modid}
          modpath={sheet.installedMod.path}
          modsDirectory={profilePath}
          name={sheet.mod.name}
          onOpenChange={setSheetOpen}
          open={sheetOpen}
        />
      )}
      {sheet?.kind === "standalone" && (
        <StandaloneInstallPickerSheet
          key={sheet.mod.modid}
          mod={sheet.mod}
          onOpenChange={setSheetOpen}
          open={sheetOpen}
        />
      )}
    </TooltipProvider>
  );
}
