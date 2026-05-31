import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";

import { ModItem } from "@/components/items/mod.item";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

type ModsParams = {
  versions: string[];
  search: string;
};

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

const modsQuery = (params: ModsParams) => ({
  placeholderData: keepPreviousData,
  queryFn: () => invoke("fetch_mods", { options: params }) as Promise<Mod[]>,
  queryKey: ["mods", params],
  refetchOnWindowFocus: false,
});

export function ModList({
  scrollRef,
  installation,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  installation: Installation;
}) {
  const {
    searchText,
    selectedModTags,
    selectedGameVersions,
    sortBy,
    orderDirection,
    author,
    side,
    category,
  } = useModsFilters();
  const { data: mods } = useQuery(
    modsQuery({
      search: searchText,
      versions: selectedGameVersions.map((version) => version),
    }),
  );
  const { data: instMods } = useInstalledMods(installation.path);
  const { data: modUpdates } = useModUpdates(
    {
      installationId: installation.id,
      params: instMods?.mods.map((mod) => `${mod.modid}@${mod.version}`).join(",") ?? "",
    },
    {
      enabled: !!instMods?.mods.length,
    },
  );

  // Precompute O(1) lookup set for installed mod checks (was O(n·m) in comparator)
  const installedModIdSet = useMemo(
    () => new Set(instMods?.mods.flatMap((m) => [m.modid, m.modid.toString()])),
    [instMods],
  );

  // Memoize the expensive filter + sort chain so it doesn't re-run on every scroll render
  const modsList = useMemo(() => {
    if (!mods) return [];
    return mods
      .filter((mod) => {
        if (selectedModTags.length > 0) {
          return selectedModTags.every((tag) => mod.tags.includes(tag.name));
        }
        return true;
      })
      .filter((mod) => {
        if (author) {
          return mod.author.toLowerCase().includes(author.toLowerCase());
        }
        return true;
      })
      .filter((mod) => mod.type === category)
      .filter((mod) =>
        side !== "installed"
          ? side === "any"
            ? true
            : mod.side === side
          : installedModIdSet.has(mod.modid) ||
            mod.modidstrs.some((id) => installedModIdSet.has(id)),
      )
      .sort((a, b) => {
        if (side === "installed") {
          const aInstalled =
            installedModIdSet.has(a.modid) ||
            (a.urlalias !== null && installedModIdSet.has(a.urlalias)) ||
            a.modidstrs.some((id) => installedModIdSet.has(Number(id)));
          const bInstalled =
            installedModIdSet.has(b.modid) ||
            (b.urlalias !== null && installedModIdSet.has(b.urlalias)) ||
            b.modidstrs.some((id) => installedModIdSet.has(Number(id)));

          if (orderDirection === "descending") {
            return a.side === "both"
              ? -1
              : b.side === "both"
                ? 1
                : aInstalled
                  ? -1
                  : bInstalled
                    ? 1
                    : 0;
          }
          return a.side === "both"
            ? 1
            : b.side === "both"
              ? -1
              : aInstalled
                ? 1
                : bInstalled
                  ? -1
                  : 0;
        }
        if (sortBy === "name") {
          return orderDirection === "descending"
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
        }
        if (sortBy === "updated") {
          return orderDirection === "descending"
            ? new Date(b.lastreleased).getTime() - new Date(a.lastreleased).getTime()
            : new Date(a.lastreleased).getTime() - new Date(b.lastreleased).getTime();
        }
        if (sortBy === "downloads") {
          return orderDirection === "descending"
            ? a.downloads - b.downloads
            : b.downloads - a.downloads;
        }
        if (sortBy === "follows") {
          return orderDirection === "descending" ? a.follows - b.follows : b.follows - a.follows;
        }
        if (sortBy === "trending") {
          return orderDirection === "descending"
            ? a.trendingpoints - b.trendingpoints
            : b.trendingpoints - a.trendingpoints;
        }
        if (sortBy === "comments") {
          return orderDirection === "descending"
            ? a.comments - b.comments
            : b.comments - a.comments;
        }
        return orderDirection === "descending" ? 0 : -1;
      });
  }, [mods, selectedModTags, author, category, side, installedModIdSet, sortBy, orderDirection]);

  const estimateSize = useCallback(() => 81, []);

  const rowVirtualizer = useVirtualizer({
    count: modsList.length,
    estimateSize,
    getScrollElement: () => scrollRef.current,
    measureElement,
    overscan: 5,
  });

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
        const mod = modsList[item.index];
        return (
          <div
            className="absolute top-0 left-0 flex w-full gap-2 not-last:border-b"
            data-index={item.index}
            key={mod.modid}
            ref={rowVirtualizer.measureElement}
            style={{
              transform: `translateY(${item.start}px)`,
              willChange: "transform",
            }}
          >
            <ModItem
              installation={installation}
              installedMods={instMods?.mods ?? []}
              mod={mod}
              modUpdates={modUpdates}
            />
          </div>
        );
      })}
    </div>
  );
}
