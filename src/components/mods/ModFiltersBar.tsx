import {
  ArrowDownNarrowWide,
  ArrowUpDown,
  ArrowUpNarrowWide,
  CalendarDays,
  FolderOpen,
  ListFilter,
  Tags,
} from "lucide-react";
import { useMemo, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { compareSemverDesc, stripped } from "@/lib/helpers";
import { sortOptions, type SortBy } from "@/lib/mod-sort";
import type { ModTag } from "@/lib/types";

import { ModAuthorFilter } from "./ModAuthorFilter";
import { ModSearchInput } from "./ModSearchInput";
import { UpdateAllButton } from "./UpdateAllButton";
import {
  categoryOptions,
  type Category,
  type ModFiltersState,
  type ModsData,
  type Side,
} from "./use-mods-data";

/** Search, tag/version pickers, sort and side controls above the mod list. */
export function ModFiltersBar({
  destinationLabel,
  filters,
  gameVersions,
  instMods,
  modCount,
  modTags,
  modUpdates,
  modsDirectory,
}: {
  filters: ModFiltersState;
  gameVersions: string[] | undefined;
  modTags: ModsData["modTags"];
  instMods: ModsData["instMods"];
  modUpdates: ModsData["modUpdates"];
  modsDirectory: string | undefined;
  destinationLabel: string;
  modCount: number;
}) {
  const versionAnchor = useRef<HTMLDivElement | null>(null);
  const tagAnchor = useRef<HTMLDivElement | null>(null);
  const {
    author,
    category,
    orderDirection,
    searchText,
    selectedGameVersions,
    selectedModTags,
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
  } = filters;

  const showInstalled = !!modsDirectory;
  const sortedGameVersions = useMemo(
    () => gameVersions?.toSorted(compareSemverDesc) ?? [],
    [gameVersions],
  );
  const sortedTags = useMemo(
    () =>
      modTags ? [...modTags].sort((a, b) => stripped(a.name).localeCompare(stripped(b.name))) : [],
    [modTags],
  );
  const tagByName = useMemo(() => {
    const map: Record<string, ModTag> = {};
    for (const tag of modTags ?? []) map[tag.name] = tag;
    return map;
  }, [modTags]);
  const tagColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const tag of modTags ?? []) map[tag.name] = tag.color;
    return map;
  }, [modTags]);

  const selectedTagNames = useMemo(() => selectedModTags.map((t) => t.name), [selectedModTags]);
  const handleTagNamesChange = (names: string[]) => {
    setSelectedModTags(
      names.map((name) => tagByName[name]).filter((tag): tag is ModTag => tag !== undefined),
    );
  };

  const sortItems = useMemo(
    () => Object.entries(sortOptions).map(([value, label]) => ({ label, value })),
    [],
  );
  const categoryItems = useMemo(
    () => Object.entries(categoryOptions).map(([value, label]) => ({ label, value })),
    [],
  );

  const updateCount = Object.keys(modUpdates?.updates ?? {}).length;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ModSearchInput
          className="w-full sm:w-72"
          onChange={setSearchText}
          placeholder="Search mods..."
          value={searchText}
        />

        <Combobox
          multiple
          value={selectedGameVersions}
          onValueChange={(value) =>
            setSelectedGameVersions(Array.isArray(value) ? (value as string[]) : [])
          }
        >
          <ComboboxChips className="w-52" ref={versionAnchor}>
            <CalendarDays className="text-muted-foreground size-3.5 shrink-0" />
            <ComboboxValue>
              {(values: string[]) => (
                <>
                  {values.slice(0, 2).map((version) => (
                    <ComboboxChip key={version}>{version}</ComboboxChip>
                  ))}
                  {values.length > 2 && (
                    <span className="bg-muted text-muted-foreground inline-flex items-center px-1.5 py-0.5 text-xs">
                      +{values.length - 2}
                    </span>
                  )}
                  <ComboboxInput
                    aria-label="Filter by game version"
                    placeholder={values.length > 0 ? "" : "Game versions..."}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={versionAnchor}>
            <ComboboxEmpty>No versions found.</ComboboxEmpty>
            <ComboboxList>
              {sortedGameVersions.map((version) => (
                <ComboboxItem key={version} value={version}>
                  {version}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <Combobox multiple value={selectedTagNames} onValueChange={handleTagNamesChange}>
          <ComboboxChips className="w-52" ref={tagAnchor}>
            <Tags className="text-muted-foreground size-3.5 shrink-0" />
            <ComboboxValue>
              {(values: string[]) => (
                <>
                  {values.slice(0, 2).map((name) => {
                    const color = tagColorMap[name];
                    return (
                      <ComboboxChip
                        key={name}
                        className="border"
                        style={
                          color
                            ? {
                                backgroundColor: `${color}20`,
                                borderColor: `${color}50`,
                                color,
                              }
                            : undefined
                        }
                      >
                        {name}
                      </ComboboxChip>
                    );
                  })}
                  {values.length > 2 && (
                    <span className="bg-muted text-muted-foreground inline-flex items-center px-1.5 py-0.5 text-xs">
                      +{values.length - 2}
                    </span>
                  )}
                  <ComboboxInput
                    aria-label="Filter by tag"
                    placeholder={values.length > 0 ? "" : "Mod tags..."}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={tagAnchor}>
            <ComboboxEmpty>No tags found.</ComboboxEmpty>
            <ComboboxList>
              {sortedTags.map((tag) => (
                <ComboboxItem key={tag.tagid} value={tag.name}>
                  {tag.name}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <ModAuthorFilter
          onChange={setAuthor}
          searchText={searchText}
          selectedGameVersions={selectedGameVersions}
          value={author}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={sortItems}
          value={sortBy}
          onValueChange={(value) => {
            if (typeof value === "string") setSortBy(value as SortBy);
          }}
        >
          <SelectTrigger size="sm" aria-label="Sort by">
            <ArrowUpDown className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          aria-label="Toggle sort direction"
          onClick={() =>
            setOrderDirection(orderDirection === "descending" ? "ascending" : "descending")
          }
          size="icon-sm"
          title={orderDirection === "descending" ? "Descending" : "Ascending"}
          variant="outline"
        >
          {orderDirection === "descending" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
        </Button>

        <Select
          items={categoryItems}
          value={category}
          onValueChange={(value) => {
            if (typeof value === "string") setCategory(value as Category);
          }}
        >
          <SelectTrigger size="sm" aria-label="Category">
            <ListFilter className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {categoryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
            Side
          </span>
          <ToggleGroup
            aria-label="Filter by side"
            size="sm"
            value={[side]}
            onValueChange={(value) => {
              if (value[0]) setSide(value[0] as Side);
            }}
            variant="outline"
          >
            <ToggleGroupItem value="any">Any</ToggleGroupItem>
            <ToggleGroupItem value="client">Client</ToggleGroupItem>
            <ToggleGroupItem value="server">Server</ToggleGroupItem>
            <ToggleGroupItem value="both">Both</ToggleGroupItem>
            {showInstalled && <ToggleGroupItem value="installed">Installed</ToggleGroupItem>}
          </ToggleGroup>
        </div>

        <div className="text-muted-foreground ms-auto flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="outline" className="text-muted-foreground gap-1.5">
            <FolderOpen />
            {destinationLabel}
          </Badge>
          <span className="tabular-nums">{modCount.toLocaleString()} mods</span>
          {showInstalled && instMods && modUpdates && updateCount > 0 && (
            <UpdateAllButton
              destinationLabel={destinationLabel}
              installedMods={instMods.mods}
              modsDirectory={modsDirectory}
              updates={modUpdates}
            />
          )}
        </div>
      </div>
    </div>
  );
}
