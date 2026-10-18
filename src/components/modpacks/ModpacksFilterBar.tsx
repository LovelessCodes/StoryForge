import { ArrowDownNarrowWide, ArrowUpNarrowWide, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModpacksFilters, type ModpacksFilters } from "@/stores/modpacksFilters";

/** Search, sort and owner filters for the modpack list. */
export default function ModpacksFilterBar() {
  const { t } = useTranslation();
  const {
    searchText,
    setSearchText,
    sortBy,
    setSortBy,
    orderDirection,
    setOrderDirection,
    owner,
    setOwner,
  } = useModpacksFilters();
  const sortOptions: { label: string; value: ModpacksFilters["sortBy"] }[] = [
    { label: t("modpacks.sort.created"), value: "created" },
    { label: t("modpacks.sort.downloads"), value: "downloads" },
    { label: t("modpacks.sort.name"), value: "name" },
    { label: t("modpacks.sort.lastUpdated"), value: "updated" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-64">
        <InputGroupInput
          aria-label={t("modpacks.page.searchAria")}
          placeholder={t("modpacks.page.searchPlaceholder")}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <Search className="size-4" />
        </InputGroupAddon>
      </InputGroup>

      <Select
        items={sortOptions}
        value={sortBy}
        onValueChange={(value) => {
          if (value) setSortBy(value);
        }}
      >
        <SelectTrigger aria-label={t("modpacks.page.sortByAria")} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {sortOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        aria-label={t("modpacks.page.toggleSortAria")}
        size="icon-sm"
        title={orderDirection === "desc" ? t("modpacks.page.sortDesc") : t("modpacks.page.sortAsc")}
        variant="outline"
        onClick={() => setOrderDirection(orderDirection === "desc" ? "asc" : "desc")}
      >
        {orderDirection === "desc" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
      </Button>

      <InputGroup className="w-full sm:w-52">
        <InputGroupInput
          aria-label={t("modpacks.page.filterOwnerAria")}
          placeholder={t("modpacks.page.filterOwnerPlaceholder")}
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <Search className="size-4" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
