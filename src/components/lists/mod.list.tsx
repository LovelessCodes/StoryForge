import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect } from "react";

import { ModItem } from "@/components/items/mod.item";

export type Mod = {
  modid: number;
  assetid: number;
  downloads: number;
  follows: number;
  trendingpoints: number;
  comments: number;
  name: string;
  summary: string;
  modidstrs: string[];
  author: string;
  urlalias: string | null;
  side: string;
  type: string;
  logo: string | null;
  tags: string[];
  lastreleased: string;
};

export type ModFilterState = {
  searchText: string;
  selectedModTags: { tagid: number; name: string; color: string }[];
  selectedGameVersions: string[];
  sortBy: "created" | "name" | "trending" | "downloads" | "follows" | "comments" | "updated";
  orderDirection: "ascending" | "descending";
  author: string;
  side: "any" | "client" | "server" | "both" | "installed";
  category: "mod" | "externaltool" | "other";
};

import type { OutputMod } from "@/components/pages/mods-browser";
import type { ModUpdatesResponse } from "@/hooks/use-mod-updates";
import type { ModTag } from "@/lib/types";

export function ModList({
  scrollElement,
  modsDirectory,
  mods,
  installedMods,
  modUpdates,
  tagColorMap,
  tagByName,
  selectedTagNames,
  onTagClick,
  onAuthorClick,
}: {
  scrollElement: HTMLDivElement | null;
  modsDirectory?: string;
  mods: Mod[];
  installedMods: OutputMod[];
  modUpdates: ModUpdatesResponse | undefined;
  tagColorMap: Record<string, string>;
  tagByName: Record<string, ModTag>;
  selectedTagNames: Set<string>;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  onAuthorClick: (author: string) => void;
}) {
  const estimateSize = useCallback(() => 100, []);

  const rowVirtualizer = useVirtualizer({
    count: mods.length,
    estimateSize,
    getScrollElement: () => scrollElement,
    measureElement,
    overscan: 5,
  });

  useEffect(() => {
    if (scrollElement) {
      rowVirtualizer.measure();
    }
  }, [scrollElement, rowVirtualizer]);

  const items = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div
      className="relative"
      style={{
        height: totalSize,
      }}
    >
      {items.map((item) => {
        const mod = mods[item.index];
        return (
          <div
            className="absolute top-0 left-0 flex w-full gap-2 not-last:border-b"
            data-index={item.index}
            key={mod.modid}
            ref={rowVirtualizer.measureElement}
            style={{
              transform: `translateY(${item.start}px)`,
            }}
          >
            <ModItem
              modsDirectory={modsDirectory}
              installedMods={installedMods}
              mod={mod}
              modUpdates={modUpdates}
              tagColorMap={tagColorMap}
              tagByName={tagByName}
              selectedTagNames={selectedTagNames}
              onTagClick={onTagClick}
              onAuthorClick={onAuthorClick}
            />
          </div>
        );
      })}
    </div>
  );
}
