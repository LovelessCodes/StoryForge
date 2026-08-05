import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";

import { AuthorAutocomplete } from "@/components/auto-completes/author.auto-complete";
import { UpdateAllButton } from "@/components/buttons/update-all.button";
import { SearchInput } from "@/components/inputs/search.input";
import type { Mod } from "@/components/lists/mod.list";
import { ModList } from "@/components/lists/mod.list";
import { TextSwitch } from "@/components/switches/text.switch";
import SideToggleGroup from "@/components/tabs/side.tab";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useModUpdates } from "@/hooks/use-mod-updates";
import { gameVersionsQuery, modTagsQuery } from "@/lib/queries";
import type { ModTag } from "@/lib/types";
import { cn, compareSemverDesc, stripped } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

export type OutputMod = {
  modid: number;
  name: string;
  authors: string[];
  version: string;
  path: string;
};

export type SortBy =
  | "relevance"
  | "created"
  | "name"
  | "trending"
  | "downloads"
  | "follows"
  | "comments"
  | "updated";
type OrderDirection = "ascending" | "descending";
type Side = "any" | "client" | "server" | "both" | "installed";
type Category = "mod" | "externaltool" | "other";

export const sortOptions: Record<SortBy, string> = {
  comments: "Comments",
  created: "Created",
  downloads: "Downloads",
  follows: "Follows",
  name: "Name",
  relevance: "Relevance",
  trending: "Trending",
  updated: "Last Updated",
};

const categoryOptions: Record<Category, string> = {
  externaltool: "External Tool",
  mod: "Mod",
  other: "Other",
};

type ModsParams = {
  versions: string[];
  search: string;
};

const modsQuery = (params: ModsParams) => ({
  placeholderData: keepPreviousData,
  queryFn: () => invoke("fetch_mods", { options: params }) as Promise<Mod[]>,
  queryKey: ["mods", params],
  refetchOnWindowFocus: false,
  staleTime: Infinity,
});

/** Ranks match quality: exact name > name starts-with > name contains > tag match > description match. */
function relevanceRank(mod: Mod, query: string): number {
  const q = stripped(query);
  if (!q) return 5;
  const name = stripped(mod.name);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (mod.tags.some((tag) => stripped(tag).includes(q))) return 3;
  if (stripped(mod.summary).includes(q)) return 4;
  return 5;
}

export function ModBrowser({ modsDirectory }: { modsDirectory?: string }) {
  // ── Local filter state (replaces zustand useModsFilters) ──
  const [searchText, setSearchText] = useState("");
  const [selectedModTags, setSelectedModTags] = useState<ModTag[]>([]);
  const [selectedGameVersions, setSelectedGameVersions] = useState<string[]>([]);
  const defaultModSortBy = useSettingsStore((state) => state.defaultModSortBy);
  const [sortBy, setSortBy] = useState<SortBy>(defaultModSortBy);
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("ascending");
  const [author, setAuthor] = useState("");
  const [side, setSide] = useState<Side>("any");
  const [category, setCategory] = useState<Category>("mod");

  // ── Filter helpers ──
  const addGameVersion = (version: string) => setSelectedGameVersions((prev) => [...prev, version]);
  const removeGameVersion = (version: string) =>
    setSelectedGameVersions((prev) => prev.filter((v) => v !== version));
  const addModTag = (tag: ModTag) => setSelectedModTags((prev) => [...prev, tag]);
  const removeModTag = (tag: ModTag) =>
    setSelectedModTags((prev) => prev.filter((t) => t.tagid !== tag.tagid));

  // ── Queries ──
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { data: modTags } = useQuery(modTagsQuery);
  const { data: mods } = useQuery(
    modsQuery({
      search: searchText,
      versions: selectedGameVersions.map((version) => version),
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
  const installedModIdSet = useMemo(
    () => new Set(instMods?.mods.flatMap((m) => [m.modid, m.modid.toString()])),
    [instMods],
  );

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
          !installedModIdSet.has(mod.modid) &&
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

  // ── Tag lookup tables for ModItem ──
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

  const selectedTagNames = useMemo(
    () => new Set(selectedModTags.map((t) => t.name)),
    [selectedModTags],
  );

  // ── Tag click handler ──
  const handleTagClick = (tag: ModTag, isActive: boolean) => {
    if (isActive) {
      removeModTag(tag);
    } else {
      addModTag(tag);
    }
  };

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollAreaViewportRef = useCallback((element: HTMLDivElement | null) => {
    setScrollElement(element);
  }, []);

  const showInstalledTab = !!modsDirectory;

  return (
    <div className="grid size-full grid-rows-[min-content_auto] gap-2">
      {/* Filter bar */}
      <div className="flex h-fit flex-wrap items-center gap-2 px-2 pt-0.5 pb-2 max-md:pl-9">
        <SearchInput
          className="h-9"
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search mods..."
          value={searchText}
        />
        <Select multiple value={selectedGameVersions}>
          <SelectTrigger className="h-9 w-40">
            <span
              className={cn(
                "pointer-events-none absolute inset-s-1 z-10 -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
                selectedGameVersions.length > 0
                  ? "top-0 bg-background text-xs"
                  : "top-1/2 bg-transparent",
              )}
            >
              Game Version(s)
            </span>
            <SelectValue>
              {selectedGameVersions.length > 0
                ? selectedGameVersions.length > 1
                  ? `${selectedGameVersions.length} versions`
                  : selectedGameVersions[0]
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {gameVersions?.sort(compareSemverDesc).map((version) => (
              <SelectItem
                key={version}
                onClick={() =>
                  selectedGameVersions.includes(version)
                    ? removeGameVersion(version)
                    : addGameVersion(version)
                }
                value={version}
              >
                {version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select multiple value={selectedModTags}>
          <SelectTrigger className="h-9 w-40">
            <span
              className={cn(
                "pointer-events-none absolute inset-s-1 z-10 -translate-y-1/2 inline-flex text-muted-foreground px-2 transition-all",
                selectedModTags.length > 0
                  ? "top-0 bg-background text-xs"
                  : "top-1/2 bg-transparent",
              )}
            >
              Mod Tag(s)
            </span>
            <SelectValue>
              {selectedModTags.length > 0
                ? selectedModTags.length > 1
                  ? `${selectedModTags.length} tags`
                  : selectedModTags[0].name
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {modTags
              ?.sort((a, b) => stripped(a.name).localeCompare(stripped(b.name)))
              .map((tag) => (
                <SelectItem
                  key={tag.tagid}
                  onClick={() =>
                    selectedModTags.some((t) => t.tagid === tag.tagid)
                      ? removeModTag(tag)
                      : addModTag(tag)
                  }
                  value={tag}
                >
                  {tag.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="group relative">
          <Label className="bg-background text-muted-foreground pointer-events-none absolute inset-s-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
            Sort by
          </Label>
          <Select onValueChange={(value) => setSortBy(value as SortBy)} value={sortBy}>
            <SelectTrigger>
              {sortBy ? `${sortOptions[sortBy as keyof typeof sortOptions]}` : "Sort by"}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {Object.entries(sortOptions).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="group relative">
          <Label className="bg-background text-muted-foreground pointer-events-none absolute inset-s-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50">
            Category
          </Label>
          <Select onValueChange={(value) => setCategory(value as Category)} value={category}>
            <SelectTrigger>
              {category
                ? `${categoryOptions[category as keyof typeof categoryOptions]}`
                : "Category"}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {Object.entries(categoryOptions).map(([key, value]) => (
                <SelectItem key={key} value={key}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TextSwitch
          checked={orderDirection === "descending"}
          onCheckedChange={(checked) => setOrderDirection(checked ? "descending" : "ascending")}
          textChecked="Desc"
          textUnchecked="Asc"
        />
        <AuthorAutocomplete
          onChange={(e) => setAuthor(e.target.value)}
          value={author}
          searchText={searchText}
          selectedGameVersions={selectedGameVersions}
        />
        {/* Only show SideToggleGroup with "Installed" tab when we have a modsDirectory */}
        {showInstalledTab && (
          <SideToggleGroup side={side} onSideChange={(v) => setSide(v as Side)} />
        )}
        {!showInstalledTab && (
          // Side filter without "Installed" tab for standalone mode
          <SideToggleGroup side={side} onSideChange={(v) => setSide(v as Side)} hideInstalled />
        )}
        {showInstalledTab && modUpdates && instMods && (
          <UpdateAllButton
            modsDirectory={modsDirectory!}
            installedMods={instMods.mods}
            updates={modUpdates}
          />
        )}
      </div>
      <ScrollArea viewportRef={scrollAreaViewportRef} className="h-full w-full px-4" scrollFade>
        <ModList
          modsDirectory={modsDirectory}
          scrollElement={scrollElement}
          mods={modsList}
          installedMods={showInstalledTab ? (instMods?.mods ?? []) : []}
          modUpdates={showInstalledTab ? modUpdates : undefined}
          tagColorMap={tagColorMap}
          tagByName={tagByName}
          selectedTagNames={selectedTagNames}
          onTagClick={handleTagClick}
          onAuthorClick={setAuthor}
        />
      </ScrollArea>
      {modsDirectory && (
        <p className="text-muted-foreground absolute bottom-0 left-4 p-1 text-xs backdrop-blur-sm">
          {modsDirectory.split(/[/\\]/).pop() || modsDirectory}
        </p>
      )}
    </div>
  );
}
