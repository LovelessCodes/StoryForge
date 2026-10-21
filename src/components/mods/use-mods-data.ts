import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { useTauriEvent } from "@/hooks/use-tauri-event";
import { blockedAuthorSet, excludeBlockedAuthors } from "@/lib/mod-blocklist";
import { findMissingDependencies } from "@/lib/mod-dependencies";
import { updateCheckParams } from "@/lib/mod-pins";
import { normalizedName, relevanceRanker, type SortBy } from "@/lib/mod-sort";
import { filterModUpdates } from "@/lib/mod-updates";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import type { Mod, ModTag, OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

/** Stable empty array so the pin selector doesn't churn identities. */
const NO_PINS: string[] = [];

export type OrderDirection = "ascending" | "descending";
export type Side = "any" | "client" | "server" | "both" | "installed";
export type Category = "mod" | "externaltool" | "other";

/** Category values mapped to their `mods.category.*` display-label keys. */
export const categoryOptions: Record<Category, string> = {
  externaltool: "mods.category.externaltool",
  mod: "mods.category.mod",
  other: "mods.category.other",
};

type ModsParams = {
  search: string;
  versions: string[];
};

/**
 * How long a searched or version-filtered catalog stays in memory once nothing
 * observes it. Each one is a full multi-megabyte result set and none of them
 * are persisted, so the default lifetime would just hold them all for a day.
 */
const FILTERED_MODS_GC_TIME = 1000 * 60 * 5;

/** How long typing must pause before the catalog is re-fetched for the new text. */
const SEARCH_DEBOUNCE_MS = 250;

/** Emitted by the Rust side when a background refresh replaced the cached catalog. */
const MODS_CATALOG_REFRESHED_EVENT = "mods-catalog-refreshed";

/**
 * The command hands back ModDB's raw body so neither side re-serialises the
 * ~9k-record catalog. Validate the envelope before reading from it, so a
 * malformed response fails the query instead of reaching the page as `undefined`.
 */
function parseModsCatalog(body: ArrayBuffer): Mod[] {
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Error("The mod catalog response is not valid JSON");
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { mods?: unknown }).mods)
  ) {
    throw new Error("The mod catalog response is missing the mods array");
  }
  return (payload as { mods: Mod[] }).mods;
}

export const modsQuery = (params: ModsParams) => ({
  placeholderData: keepPreviousData,
  // The command returns ModDB's raw body so neither side re-serialises the
  // ~9k-record catalog; only the array reaches the cache.
  queryFn: async () => {
    const body = await invoke<ArrayBuffer>("fetch_mods", { options: params });
    return parseModsCatalog(body);
  },
  queryKey: ["mods", params] as const,
  refetchOnWindowFocus: false,
  staleTime: Infinity,
  gcTime: params.search || params.versions.length > 0 ? FILTERED_MODS_GC_TIME : undefined,
});

/** Filter state shared by the filter bar and the mod data hook. */
export function useModFilters(defaultSortBy: SortBy) {
  const [searchText, setSearchText] = useState("");
  // The input stays responsive; the catalog request and the relevance ranking
  // wait for typing to settle, because each request is the whole mod catalog.
  const appliedSearchText = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);
  const [selectedModTags, setSelectedModTags] = useState<ModTag[]>([]);
  const [selectedGameVersions, setSelectedGameVersions] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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
    appliedSearchText,
    author,
    category,
    favoritesOnly,
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
    setFavoritesOnly,
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
  favoritesOnly,
  modsDirectory,
  orderDirection,
  profileGameVersion,
  searchText,
  selectedGameVersions,
  selectedModTags,
  side,
  sortBy,
}: {
  author: string;
  category: Category;
  favoritesOnly: boolean;
  modsDirectory: string | undefined;
  orderDirection: OrderDirection;
  /** Game version of the target profile, for scoping update checks. */
  profileGameVersion: string;
  searchText: string;
  selectedGameVersions: string[];
  selectedModTags: ModTag[];
  side: Side;
  sortBy: SortBy;
}) {
  const queryClient = useQueryClient();
  // A stale on-disk catalog is served immediately and refreshed behind the
  // page; this swaps in the refreshed copy without the user doing anything.
  useTauriEvent(MODS_CATALOG_REFRESHED_EVENT, () => {
    void queryClient.invalidateQueries({ queryKey: ["mods"] });
  });

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
  const pinnedMods = useSettingsStore((s) =>
    modsDirectory ? (s.pinnedMods[modsDirectory] ?? NO_PINS) : NO_PINS,
  );
  const favoriteMods = useSettingsStore((s) => s.favoriteMods);
  const favoriteSet = useMemo(() => new Set(favoriteMods), [favoriteMods]);
  const blockedAuthors = useSettingsStore((s) => s.blockedAuthors);
  const blockedSet = useMemo(() => blockedAuthorSet(blockedAuthors), [blockedAuthors]);
  // Pinned mods are left out of the update check entirely, so they never show
  // an update badge and "Update All" skips them.
  const updateParams = useMemo(
    () => updateCheckParams(instMods?.mods, pinnedMods),
    [instMods, pinnedMods],
  );
  const skippedModUpdates = useSettingsStore((s) => s.skippedModUpdates);
  const { data: rawModUpdates } = useModUpdates(
    {
      path: modsDirectory ?? "",
      params: updateParams,
    },
    {
      enabled: !!modsDirectory && updateParams.length > 0,
      staleTime: Infinity,
    },
  );
  // The feed returns each mod's newest release whatever game version it
  // targets; narrow it to the profile's version and to releases the user
  // skipped. Downstream (badges and "Update All") only sees the survivors.
  const modUpdates = useMemo(
    () => filterModUpdates(rawModUpdates, profileGameVersion, skippedModUpdates),
    [rawModUpdates, profileGameVersion, skippedModUpdates],
  );

  // ── Computed data for ModList ──
  const installedModIdSet = useMemo(() => new Set(instMods?.mods.map((m) => m.modid)), [instMods]);

  // Mods by blocked authors never reach the browser; the number kept out is
  // shown so an empty result is not mistaken for a search miss.
  const unblockedMods = useMemo(
    () => (mods ? excludeBlockedAuthors(mods, blockedSet) : []),
    [mods, blockedSet],
  );
  const hiddenByBlockCount = (mods?.length ?? 0) - unblockedMods.length;

  const modsList = useMemo(() => {
    const rankBy = relevanceRanker(searchText);
    return unblockedMods
      .filter((mod) => {
        if (
          selectedModTags.length > 0 &&
          !selectedModTags.every((tag) => mod.tags.includes(tag.name))
        )
          return false;
        if (author && !mod.author.toLowerCase().includes(author.toLowerCase())) return false;
        // Only filter by category when side is not "installed"
        if (category && side !== "installed" && mod.type !== category) return false;
        if (favoritesOnly) {
          const favoriteKeys = mod.modidstrs.map((id) => id.toLowerCase());
          if (mod.urlalias) favoriteKeys.push(mod.urlalias.toLowerCase());
          if (!favoriteKeys.some((key) => favoriteSet.has(key))) {
            return false;
          }
        }
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
          const rankA = rankBy(a);
          const rankB = rankBy(b);
          if (rankA !== rankB) {
            return orderDirection === "descending" ? rankB - rankA : rankA - rankB;
          }
          // Same relevance tier — break ties by trending points.
          const lengthDiff = normalizedName(a).length - normalizedName(b).length;
          if (lengthDiff !== 0) {
            return orderDirection === "descending" ? -lengthDiff : lengthDiff;
          }
          return orderDirection === "descending"
            ? a.trendingpoints - b.trendingpoints
            : b.trendingpoints - a.trendingpoints;
        }
        if (sortBy === "name") {
          return orderDirection === "descending"
            ? normalizedName(b).localeCompare(normalizedName(a))
            : normalizedName(a).localeCompare(normalizedName(b));
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
    unblockedMods,
    selectedModTags,
    author,
    category,
    side,
    installedModIdSet,
    sortBy,
    orderDirection,
    searchText,
    favoritesOnly,
    favoriteSet,
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

  // Dependencies named by the installed mods that are not installed (shown as
  // the missing-dependencies banner above the list).
  const missingDependencies = useMemo(() => findMissingDependencies(instMods?.mods), [instMods]);

  // Several zips providing the same modid: the game may load only one, so the
  // banner above the list offers to remove the extras.
  const duplicateMods = useMemo(() => {
    const byId = new Map<string, OutputMod[]>();
    for (const mod of instMods?.mods ?? []) {
      const key = mod.modid.toLowerCase();
      const existing = byId.get(key);
      if (existing) existing.push(mod);
      else byId.set(key, [mod]);
    }
    return [...byId.entries()]
      .filter(([, mods]) => mods.length > 1)
      .map(([modid, mods]) => ({ modid, mods }));
  }, [instMods]);

  const modErrors = instMods?.errors ?? [];

  return {
    duplicateMods,
    gameVersions,
    hiddenByBlockCount,
    instMods,
    missingDependencies,
    modErrors,
    modTags,
    modsList,
    modUpdates,
    tagByName,
    tagColorMap,
  };
}

export type ModsData = ReturnType<typeof useModsData>;
