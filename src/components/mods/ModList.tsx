import { Package } from "lucide-react";

import VirtualList from "@/components/common/VirtualList";
import type { ModUpdatesResponse } from "@/hooks/use-mod-updates";
import type { Mod, ModTag, OutputMod } from "@/lib/types";

import { ModItem } from "./ModItem";

export function ModList({
  destinationLabel,
  installedMods,
  mods,
  modsDirectory,
  modUpdates,
  onAdd,
  onAuthorClick,
  onRemove,
  onStandaloneInstall,
  onTagClick,
  onUpdate,
  selectedTagNames,
  tagByName,
  tagColorMap,
}: {
  mods: Mod[];
  installedMods: OutputMod[];
  modUpdates: ModUpdatesResponse | undefined;
  modsDirectory?: string;
  destinationLabel: string;
  tagColorMap: Record<string, string>;
  tagByName: Record<string, ModTag>;
  selectedTagNames: Set<string>;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  onAuthorClick: (author: string) => void;
  onAdd: (mod: Mod) => void;
  onUpdate: (mod: Mod, installedMod: OutputMod) => void;
  onRemove: (mod: Mod, installedMod: OutputMod) => void;
  onStandaloneInstall: (mod: Mod) => void;
}) {
  return (
    <VirtualList
      items={mods}
      keyOf={(mod) => String(mod.modid)}
      estimateRowHeight={132}
      scrollButtonAlign="center"
      empty={
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <Package className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-xs">
            No mods found. Try adjusting your search or filters.
          </p>
        </div>
      }
      renderItem={(mod) => (
        <ModItem
          destinationLabel={destinationLabel}
          installedMods={installedMods}
          mod={mod}
          modsDirectory={modsDirectory}
          modUpdates={modUpdates}
          onAdd={onAdd}
          onAuthorClick={onAuthorClick}
          onRemove={onRemove}
          onStandaloneInstall={onStandaloneInstall}
          onTagClick={onTagClick}
          onUpdate={onUpdate}
          selectedTagNames={selectedTagNames}
          tagByName={tagByName}
          tagColorMap={tagColorMap}
        />
      )}
    />
  );
}
