import {
  ArrowDownNarrowWide,
  ArrowUpDown,
  ArrowUpNarrowWide,
  Bookmark,
  CalendarDays,
  FolderOpen,
  ListFilter,
  Power,
  PowerOff,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSetAllModsEnabled } from "@/hooks/use-set-mod-enabled";
import { compareSemverDesc, stripped } from "@/lib/helpers";
import { sortOptions, type SortBy } from "@/lib/mod-sort";
import type { ModTag } from "@/lib/types";

import { InstallModMenu } from "./InstallModMenu";
import { ModAuthorFilter } from "./ModAuthorFilter";
import { ModpackMenu } from "./ModpackMenu";
import { ModPresetsSheet } from "./ModPresetsSheet";
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
  canToggleMods,
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
  /** Whether the target supports the enabled/disabled mod flag (profiles do). */
  canToggleMods: boolean;
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
  const { mutate: setAllModsEnabled, isPending: bulkStatePending } =
    useSetAllModsEnabled(modsDirectory);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const versionAnchor = useRef<HTMLDivElement | null>(null);
  const tagAnchor = useRef<HTMLDivElement | null>(null);
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

  const updateCount = Object.keys(modUpdates?.updates ?? {}).length;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
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
                    placeholder={
                      values.length > 0 ? "" : t("mods.filters.gameVersions.placeholder")
                    }
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

        <Combobox
          items={tagNames}
          multiple
          value={selectedTagNames}
          onValueChange={handleTagNamesChange}
        >
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

        <Button
          aria-label={t("mods.filters.favorites.aria")}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          size="icon-sm"
          title={t("mods.filters.favorites.label")}
          variant={favoritesOnly ? "outline-amber" : "outline"}
        >
          <Star className={favoritesOnly ? "fill-current" : undefined} />
        </Button>

        <Select
          items={categoryItems}
          value={category}
          onValueChange={(value) => {
            if (typeof value === "string") setCategory(value as Category);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("mods.filters.category.aria")}>
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
            {t("mods.filters.side.label")}
          </span>
          <ToggleGroup
            aria-label={t("mods.filters.side.aria")}
            size="sm"
            value={[side]}
            onValueChange={(value) => {
              if (value[0]) setSide(value[0] as Side);
            }}
            variant="outline"
          >
            <ToggleGroupItem value="any">{t("common.states.any")}</ToggleGroupItem>
            <ToggleGroupItem value="client">{t("mods.side.client")}</ToggleGroupItem>
            <ToggleGroupItem value="server">{t("mods.side.server")}</ToggleGroupItem>
            <ToggleGroupItem value="both">{t("mods.side.both")}</ToggleGroupItem>
            {showInstalled && (
              <ToggleGroupItem value="installed">{t("common.states.installed")}</ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>

        <div className="text-muted-foreground ms-auto flex flex-wrap items-center gap-3 text-xs">
          <Badge variant="outline" className="text-muted-foreground gap-1.5">
            <FolderOpen />
            {destinationLabel}
          </Badge>
          <span className="tabular-nums">{t("mods.filters.count", { count: modCount })}</span>
          {showInstalled && modsDirectory && canToggleMods && (
            <div className="flex items-center gap-1">
              <Button
                aria-label={t("mods.toggle.enableAll")}
                disabled={bulkStatePending}
                onClick={() => setAllModsEnabled(true)}
                size="icon-sm"
                title={t("mods.toggle.enableAll")}
                variant="outline"
              >
                <Power aria-hidden="true" />
              </Button>
              <Button
                aria-label={t("mods.toggle.disableAll")}
                disabled={bulkStatePending}
                onClick={() => setAllModsEnabled(false)}
                size="icon-sm"
                title={t("mods.toggle.disableAll")}
                variant="outline"
              >
                <PowerOff aria-hidden="true" />
              </Button>
              <Button
                aria-label={t("mods.presets.button")}
                onClick={() => setPresetsOpen(true)}
                size="sm"
                title={t("mods.presets.button")}
                variant="outline"
              >
                <Bookmark aria-hidden="true" />
                <span className="hidden sm:inline">{t("mods.presets.button")}</span>
              </Button>
            </div>
          )}
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
            <ModpackMenu
              destinationLabel={destinationLabel}
              gameVersion={gameVersion}
              installedMods={instMods?.mods}
              modsDirectory={modsDirectory}
            />
          )}
        </div>
      </div>

      <ModPresetsSheet
        modsDirectory={modsDirectory}
        open={presetsOpen}
        onOpenChange={setPresetsOpen}
      />
    </div>
  );
}
