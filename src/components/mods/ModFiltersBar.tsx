import {
  ArrowDownNarrowWide,
  ArrowUpDown,
  ArrowUpNarrowWide,
  CalendarDays,
  SlidersHorizontal,
  Star,
  Tags,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compareSemverDesc, stripped } from "@/lib/helpers";
import { sortOptions, type SortBy } from "@/lib/mod-sort";
import type { ModTag } from "@/lib/types";

import { InstallModMenu } from "./InstallModMenu";
import { ModAuthorFilter } from "./ModAuthorFilter";
import { ModsActionsMenu } from "./ModsActionsMenu";
import { ModSearchInput } from "./ModSearchInput";
import { UpdateAllButton } from "./UpdateAllButton";
import {
  categoryOptions,
  type Category,
  type ModFiltersState,
  type ModsData,
  type Side,
} from "./use-mods-data";

/** Search, a small filter set, sort controls and the toolbar actions. */
export function ModFiltersBar({
  destinationLabel,
  filters,
  gameVersion,
  gameVersions,
  instMods,
  modCount,
  modTags,
  modUpdates,
  modsDirectory,
}: {
  filters: ModFiltersState;
  gameVersion: string;
  gameVersions: string[] | undefined;
  modTags: ModsData["modTags"];
  instMods: ModsData["instMods"];
  modUpdates: ModsData["modUpdates"];
  modsDirectory: string | undefined;
  destinationLabel: string;
  modCount: number;
}) {
  const { t } = useTranslation();
  const versionAnchor = useRef<HTMLDivElement | null>(null);
  const tagAnchor = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    author,
    category,
    favoritesOnly,
    orderDirection,
    searchText,
    selectedGameVersions,
    selectedModTags,
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

  const selectedTagNames = useMemo(() => selectedModTags.map((tag) => tag.name), [selectedModTags]);
  const tagNames = useMemo(() => sortedTags.map((tag) => tag.name), [sortedTags]);
  const handleTagNamesChange = (names: string[]) => {
    setSelectedModTags(
      names.map((name) => tagByName[name]).filter((tag): tag is ModTag => tag !== undefined),
    );
  };

  const sortItems = useMemo(
    () => Object.keys(sortOptions).map((value) => ({ label: t(`mods.sort.${value}`), value })),
    [t],
  );
  const categoryItems = useMemo(
    () =>
      Object.entries(categoryOptions).map(([value, labelKey]) => ({
        label: t(labelKey),
        value,
      })),
    [t],
  );
  const sideItems = useMemo(() => {
    const items = [
      { label: t("common.states.any"), value: "any" },
      { label: t("mods.side.client"), value: "client" },
      { label: t("mods.side.server"), value: "server" },
      { label: t("mods.side.both"), value: "both" },
    ];
    if (showInstalled) items.push({ label: t("common.states.installed"), value: "installed" });
    return items;
  }, [showInstalled, t]);

  // Tags, author and a non-default category are the "extra" filters the
  // popover holds; the count tells at a glance when it is narrowing the list.
  const activeFilterCount =
    (selectedModTags.length > 0 ? 1 : 0) + (author ? 1 : 0) + (category !== "mod" ? 1 : 0);

  const resetFilters = () => {
    setSelectedModTags([]);
    setAuthor("");
    setCategory("mod");
  };

  const updateCount = Object.keys(modUpdates?.updates ?? {}).length;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <ModSearchInput className="w-full sm:w-72" onChange={setSearchText} value={searchText} />

      <Combobox
        items={sortedGameVersions}
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
                  aria-label={t("mods.filters.gameVersions.aria")}
                  placeholder={values.length > 0 ? "" : t("mods.filters.gameVersions.placeholder")}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={versionAnchor}>
          <ComboboxEmpty>{t("mods.filters.gameVersions.empty")}</ComboboxEmpty>
          <ComboboxList>
            {(version: string) => (
              <ComboboxItem key={version} value={version}>
                {version}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      <Button
        aria-label={t("mods.filters.favorites.aria")}
        onClick={() => setFavoritesOnly(!favoritesOnly)}
        size="icon-sm"
        title={t("mods.filters.favorites.label")}
        variant={favoritesOnly ? "outline-amber" : "outline"}
      >
        <Star className={favoritesOnly ? "fill-current" : undefined} />
      </Button>

      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger
          render={<Button aria-label={t("mods.filters.more")} size="sm" variant="outline" />}
        >
          <SlidersHorizontal />
          {t("mods.filters.more")}
          {activeFilterCount > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[10px]">{activeFilterCount}</Badge>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <PopoverTitle>{t("mods.filters.more")}</PopoverTitle>
              {activeFilterCount > 0 && (
                <Button onClick={resetFilters} size="sm" variant="ghost">
                  {t("mods.filters.reset")}
                </Button>
              )}
            </div>

            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium">
                {t("mods.filters.tags.label")}
              </span>
              <Combobox
                items={tagNames}
                multiple
                value={selectedTagNames}
                onValueChange={handleTagNamesChange}
              >
                <ComboboxChips className="w-full" ref={tagAnchor}>
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
                          aria-label={t("mods.filters.tags.aria")}
                          placeholder={values.length > 0 ? "" : t("mods.filters.tags.placeholder")}
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={tagAnchor}>
                  <ComboboxEmpty>{t("mods.filters.tags.empty")}</ComboboxEmpty>
                  <ComboboxList>
                    {(name: string) => (
                      <ComboboxItem key={name} value={name}>
                        {name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium">
                {t("mods.filters.author.label")}
              </span>
              <ModAuthorFilter
                onChange={setAuthor}
                searchText={searchText}
                selectedGameVersions={selectedGameVersions}
                value={author}
              />
            </div>

            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-[11px] font-medium">
                {t("mods.filters.category.label")}
              </span>
              <Select
                items={categoryItems}
                value={category}
                onValueChange={(value) => {
                  if (typeof value === "string") setCategory(value as Category);
                }}
              >
                <SelectTrigger
                  aria-label={t("mods.filters.category.aria")}
                  className="w-full"
                  size="sm"
                >
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
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Select
        items={sortItems}
        value={sortBy}
        onValueChange={(value) => {
          if (typeof value === "string") setSortBy(value as SortBy);
        }}
      >
        <SelectTrigger size="sm" aria-label={t("mods.filters.sort.aria")}>
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
        aria-label={t("mods.filters.sort.toggleDirection")}
        onClick={() =>
          setOrderDirection(orderDirection === "descending" ? "ascending" : "descending")
        }
        size="icon-sm"
        title={
          orderDirection === "descending"
            ? t("mods.sortDirection.descending")
            : t("mods.sortDirection.ascending")
        }
        variant="outline"
      >
        {orderDirection === "descending" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
      </Button>

      <Select
        items={sideItems}
        value={side}
        onValueChange={(value) => {
          if (typeof value === "string") setSide(value as Side);
        }}
      >
        <SelectTrigger size="sm" aria-label={t("mods.filters.side.aria")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {sideItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="text-muted-foreground ms-auto flex flex-wrap items-center gap-3 text-xs">
        <span className="tabular-nums">{t("mods.filters.count", { count: modCount })}</span>
        {showInstalled && instMods && modUpdates && updateCount > 0 && (
          <UpdateAllButton
            destinationLabel={destinationLabel}
            installedMods={instMods.mods}
            modsDirectory={modsDirectory}
            updates={modUpdates}
          />
        )}
        {showInstalled && modsDirectory && <InstallModMenu modsDirectory={modsDirectory} />}
        {showInstalled && modsDirectory && (
          <ModsActionsMenu
            destinationLabel={destinationLabel}
            gameVersion={gameVersion}
            installedMods={instMods?.mods}
            modsDirectory={modsDirectory}
          />
        )}
      </div>
    </div>
  );
}
