import { useQueryClient } from "@tanstack/react-query";
import { User, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Combobox,
  ComboboxChips,
  ComboboxClear,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { Mod } from "@/lib/types";

import { modsQuery } from "./use-mods-data";

/** Authors number in the thousands; render only the best matches. */
const MAX_RESULTS = 50;

/** Autocomplete over the authors of the currently fetched mod page. */
export function ModAuthorFilter({
  onChange,
  searchText,
  selectedGameVersions,
  value,
}: {
  onChange: (author: string) => void;
  searchText: string;
  selectedGameVersions: string[];
  value: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const anchor = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");

  const mods = queryClient.getQueryData<Mod[]>(
    modsQuery({ search: searchText, versions: selectedGameVersions }).queryKey,
  );

  const authorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mod of mods ?? []) {
      if (mod.author) counts.set(mod.author, (counts.get(mod.author) ?? 0) + 1);
    }
    return counts;
  }, [mods]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...authorCounts.entries()]
      .filter(([author]) => !q || author.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_RESULTS)
      .map(([author]) => author);
  }, [authorCounts, query]);

  return (
    <Combobox
      value={value || null}
      onValueChange={(next) => onChange(typeof next === "string" ? next : "")}
      onInputValueChange={setQuery}
      items={[...authorCounts.keys()]}
    >
      <ComboboxChips className="w-52" ref={anchor}>
        <User className="text-muted-foreground size-3.5 shrink-0" />
        <ComboboxInput
          placeholder={t("mods.authorFilter.placeholder")}
          aria-label={t("mods.authorFilter.aria")}
        />
        {value && (
          <ComboboxClear aria-label={t("mods.authorFilter.clear")}>
            <X className="size-3" />
          </ComboboxClear>
        )}
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        {/* The list is pre-filtered here, so base-ui's own Empty state cannot
            see which items were dropped. */}
        {matches.length === 0 && (
          <div className="text-muted-foreground px-2 py-2 text-xs">
            {t("mods.authorFilter.empty")}
          </div>
        )}
        <ComboboxList>
          {matches.map((author) => {
            const count = authorCounts.get(author) ?? 0;
            return (
              <ComboboxItem key={author} value={author}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{author}</span>
                  <span className="text-muted-foreground text-[10px]">
                    {t("mods.authorFilter.count", { count })}
                  </span>
                </span>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
