import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";

import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { stripped } from "@/lib/helpers";
import { relevanceRank, type SortBy } from "@/lib/mod-sort";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import type { Mod, ModTag } from "@/lib/types";

export type OrderDirection = "ascending" | "descending";
export type Side = "any" | "client" | "server" | "both" | "installed";
export type Category = "mod" | "externaltool" | "other";

export const categoryOptions: Record<Category, string> = {
  externaltool: "External Tool",
  mod: "Mod",
  other: "Other",
};

type ModsParams = {
  search: string;
  versions: string[];
};

export const modsQuery = (params: ModsParams) => ({
  placeholderData: keepPreviousData,
  queryFn: () => invoke("fetch_mods", { options: params }) as Promise<Mod[]>,
  queryKey: ["mods", params] as const,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
});

/** Filter state shared by the filter bar and the mod data hook. */
export function useModFilters(defaultSortBy: SortBy) {
  const [searchText, setSearchText] = useState("");
  const [selectedModTags, setSelectedModTags] = useState<ModTag[]>([]);
  const [selectedGameVersions, setSelectedGameVersions] = useState<string[]>([]);
  const selectedGameVersionsSet = useMemo(
    () => new Set(selectedGameVersions),
    [selectedGameVersions],
  );
  const [sortBy, setSortBy] = useState<SortBy>(defaultSortBy);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("ascending");
  const [author, setAuthor] = useState("");
  const [side, setSide] = useState<Side>("any");
  const [category, setCategory] = useState<Category>("mod");

  // ── Filter helpers ──
  const addGameVersion = (version: string) =>
    setSelectedGameVersions((prev) => (prev.includes(version) ? prev : [...prev, version]));
  const removeGameVersion = (version: string) =>
    setSelectedGameVersions((prev) => prev.filter((v) => v !== version));
  const addModTag = (tag: ModTag) =>
    setSelectedModTags((prev) => (prev.some((t) => t.tagid === tag.tagid) ? prev : [...prev, tag]));
  const removeModTag = (tag: ModTag) =>
    setSelectedModTags((prev) => prev.filter((t) => t.tagid !== tag.tagid));
  const selectedTagNames = useMemo(
    () => new Set(selectedModTags.map((t) => t.name)),
    [selectedModTags],
  );

  const handleTagClick = (tag: ModTag, isActive: boolean) => {
    if (isActive) {
      removeModTag(tag);
    } else {
      addModTag(tag);
    }
  };

  return {
    addGameVersion,
    addModTag,
    author,
    category,
    handleTagClick,
    orderDirection,
    removeGameVersion,
    removeModTag,
    searchText,
    selectedGameVersions,
    selectedGameVersionsSet,
    selectedModTags,
    selectedTagNames,
    setAuthor,
    setCategory,
    setOrderDirection,
    setSearchText,
    setSelectedGameVersions,
    setSelectedModTags,
    setSide,
    setSortBy,
    side,
    sortBy,
  };
}

export type ModFiltersState = ReturnType<typeof useModFilters>;

/** Mods, tags and the filtered/sorted list for the browser. */
export function useModsData({
  author,
  category,
  modsDirectory,
  orderDirection,
  searchText,
  selectedGameVersions,
  selectedModTags,
  side,
  sortBy,
}: {
  author: string;
  category: Category;
  modsDirectory: string | undefined;
  orderDirection: OrderDirection;
  searchText: string;
  selectedGameVersions: string[];
  selectedModTags: ModTag[];
  side: Side;
  sortBy: SortBy;
}) {
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: modTags } = useQuery(modTagsQuery);
  const { data: mods } = useQuery(
    modsQuery({
      search: searchText,
      versions: selectedGameVersions,
    }),
  );
  const { data: instMods } = useInstalledMods(modsDirectory ?? "", {
    enabled: !!modsDirectory,
    staleTime: Infinity,
  });
  const { data: modUpdates } = useModUpdates(
    {
      path: modsDirectory ?? "",
      params: instMods?.mods?.map((mod) => `${mod.modid}@${mod.version}`).join(",") ?? "",
    },
    {
      enabled: !!modsDirectory && !!instMods?.mods?.length,
      staleTime: Infinity,
    },
  );

  // ── Computed data for ModList ──
  const installedModIdSet = useMemo(() => new Set(instMods?.mods.map((m) => m.modid)), [instMods]);

  const modsList = useMemo(() => {
    if (!mods) return [];
    return mods
      .filter((mod) => {
        if (
          selectedModTags.length > 0 &&
          !selectedModTags.every((tag) => mod.tags.includes(tag.name))
        )
          return false;
        if (author && !mod.author.toLowerCase().includes(author.toLowerCase())) return false;
        // Only filter by category when side is not "installed"
        if (category && side !== "installed" && mod.type !== category) return false;
        if (side !== "installed") {
          if (side !== "any" && mod.side !== side) return false;
        } else if (
          !installedModIdSet.has(String(mod.modid)) &&
          !mod.modidstrs.some((id) => installedModIdSet.has(id))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "relevance") {
          const rankA = relevanceRank(a, searchText);
          const rankB = relevanceRank(b, searchText);
          if (rankA !== rankB) {
            return orderDirection === "descending" ? rankB - rankA : rankA - rankB;
          }
          // Same relevance tier — break ties by trending points.
          const lengthDiff = stripped(a.name).length - stripped(b.name).length;
          if (lengthDiff !== 0) {
            return orderDirection === "descending" ? -lengthDiff : lengthDiff;
          }
          return orderDirection === "descending"
            ? a.trendingpoints - b.trendingpoints
            : b.trendingpoints - a.trendingpoints;
        }
        if (sortBy === "name") {
          return orderDirection === "descending"
            ? stripped(b.name).localeCompare(stripped(a.name))
            : stripped(a.name).localeCompare(stripped(b.name));
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
  }, [
    mods,
    selectedModTags,
    author,
    category,
    side,
    installedModIdSet,
    sortBy,
    orderDirection,
    searchText,
  ]);

  const tagColorMap = useMemo(() => {
    if (!modTags) return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const t of modTags) map[t.name] = t.color;
    return map;
  }, [modTags]);

  const tagByName = useMemo(() => {
    if (!modTags) return {} as Record<string, ModTag>;
    const map: Record<string, ModTag> = {};
    for (const t of modTags) map[t.name] = t;
    return map;
  }, [modTags]);

  return { gameVersions, instMods, modTags, modsList, modUpdates, tagByName, tagColorMap };
}

export type ModsData = ReturnType<typeof useModsData>;
