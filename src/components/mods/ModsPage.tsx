import { useState } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { pathBasename } from "@/lib/helpers";
import type { Mod, OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

import { AddModSheet } from "./AddModSheet";
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
};

type SheetRequest =
  | { kind: "add"; mod: Mod }
  | { kind: "update"; mod: Mod; installedMod: OutputMod }
  | { kind: "remove"; mod: Mod; installedMod: OutputMod }
  | { kind: "standalone"; mod: Mod };

export default function ModsPage({ targetPath, targetLabel }: ModsPageProps) {
  const { activeProfile } = useActiveProfile();
  const defaultModSortBy = useSettingsStore((s) => s.defaultModSortBy);
  const filters = useModFilters(defaultModSortBy);

  // The profile root (not the Mods subdir) is what the installed-mods and
  // update commands expect.
  const profilePath = targetPath ?? activeProfile?.path;
  const destinationLabel =
    targetLabel ?? (targetPath ? pathBasename(targetPath) : (activeProfile?.name ?? "Standalone"));

  const data = useModsData({
    author: filters.author,
    category: filters.category,
    modsDirectory: profilePath,
    orderDirection: filters.orderDirection,
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

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <ModFiltersBar
          destinationLabel={destinationLabel}
          filters={filters}
          gameVersions={data.gameVersions}
          instMods={data.instMods}
          modCount={data.modsList.length}
          modsDirectory={profilePath}
          modTags={data.modTags}
          modUpdates={data.modUpdates}
        />
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
