import {
  ArrowDownNarrowWide,
  ArrowUpDown,
  ArrowUpNarrowWide,
  CalendarDays,
  Star,
  UserX,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { compareSemverDesc } from "@/lib/helpers";
import { sortOptions, type SortBy } from "@/lib/mod-sort";
import { useSettingsStore } from "@/stores/settings";

import { ModExtraFilters } from "./ModExtraFilters";
import { ModSearchInput } from "./ModSearchInput";
import { ModsToolbarStatus } from "./ModsToolbarStatus";
import { type ModFiltersState, type ModsData, type Side } from "./use-mods-data";

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
  onManageBlocked,
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
  onManageBlocked: () => void;
}) {
  const { t } = useTranslation();
  const versionAnchor = useRef<HTMLDivElement | null>(null);
  const tagAnchor = useRef<HTMLDivElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const blockedCount = useSettingsStore((s) => s.blockedAuthors.length);
  const {
    favoritesOnly,
    orderDirection,
    searchText,
    selectedGameVersions,
    setFavoritesOnly,
    setOrderDirection,
    setSearchText,
    setSelectedGameVersions,
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

  const sortItems = useMemo(
    () => Object.keys(sortOptions).map((value) => ({ label: t(`mods.sort.${value}`), value })),
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

      <Button
        aria-label={t("mods.blocked.button")}
        onClick={onManageBlocked}
        size="icon-sm"
        title={t("mods.blocked.button")}
        variant={blockedCount > 0 ? "outline-amber" : "outline"}
      >
        <UserX />
      </Button>

      <ModExtraFilters
        filters={filters}
        modTags={modTags}
        onOpenChange={setFiltersOpen}
        open={filtersOpen}
        tagAnchor={tagAnchor}
      />

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

      <ModsToolbarStatus
        destinationLabel={destinationLabel}
        gameVersion={gameVersion}
        instMods={instMods}
        modCount={modCount}
        modsDirectory={modsDirectory}
        modUpdates={modUpdates}
      />
    </div>
  );
}
