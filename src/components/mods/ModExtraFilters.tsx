import { SlidersHorizontal, Tags } from "lucide-react";
import { useMemo, type RefObject } from "react";
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
import { stripped } from "@/lib/helpers";
import type { ModTag } from "@/lib/types";

import { ModAuthorFilter } from "./ModAuthorFilter";
import {
  categoryOptions,
  type Category,
  type ModFiltersState,
  type ModsData,
} from "./use-mods-data";

/**
 * The "more filters" popover: tags, author and a non-default category. Its
 * badge shows at a glance when the extra filters are narrowing the list.
 */
export function ModExtraFilters({
  filters,
  modTags,
  onOpenChange,
  open,
  tagAnchor,
}: {
  filters: ModFiltersState;
  modTags: ModsData["modTags"];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Anchor for the tag combobox popup, owned by the filter bar. */
  tagAnchor: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation();
  const {
    author,
    category,
    searchText,
    selectedGameVersions,
    selectedModTags,
    setAuthor,
    setCategory,
    setSelectedModTags,
  } = filters;

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

  const categoryItems = useMemo(
    () =>
      Object.entries(categoryOptions).map(([value, labelKey]) => ({
        label: t(labelKey),
        value,
      })),
    [t],
  );

  // Tags, author and a non-default category are the "extra" filters the
  // popover holds; the count tells at a glance when it is narrowing the list.
  const activeFilterCount =
    (selectedModTags.length > 0 ? 1 : 0) + (author ? 1 : 0) + (category !== "mod" ? 1 : 0);

  const resetFilters = () => {
    setSelectedModTags([]);
    setAuthor("");
    setCategory("mod");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
  );
}
