import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { Release } from "@/lib/types";

/** One release row: version, game tag(s) and download count. */
export function ModReleaseItem({ release }: { release: Release }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      <span>
        {release.modversion}
        <span className="text-muted-foreground">
          {" "}
          {t("mods.versionPicker.forVersion", { version: release.tags[0] })}{" "}
          {release.tags.length > 1
            ? t("mods.versionPicker.moreTags", { count: release.tags.length - 1 })
            : ""}
        </span>
      </span>
      <span className="text-muted-foreground text-xs">
        {t("mods.release.downloads", { count: release.downloads })}
      </span>
    </div>
  );
}

/**
 * Version picker shared by the add-mod, update-mod and standalone-install
 * sheets: the trigger summary and the release rows were identical in all
 * three.
 */
export function ModVersionPicker({
  onSelect,
  releases,
  selected,
}: {
  releases: Release[] | undefined;
  selected: Release | null | undefined;
  onSelect: (release: Release | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={(value) => {
        const release = releases?.find((r) => r.modversion === value) ?? null;
        onSelect(release);
      }}
      value={selected?.modversion ?? null}
    >
      <SelectTrigger className="w-full truncate" aria-label={t("mods.versionPicker.aria")}>
        <span className="truncate">
          {selected?.modversion ? (
            <>
              {selected.modversion}{" "}
              <span className="text-muted-foreground">
                {t("mods.versionPicker.forVersion", { version: selected.tags[0] })}{" "}
                {selected.tags.length > 1
                  ? t("mods.versionPicker.moreTags", { count: selected.tags.length - 1 })
                  : ""}
              </span>
            </>
          ) : (
            t("mods.versionPicker.placeholder")
          )}
        </span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {releases?.map((release) => (
          <SelectItem key={release.fileid} value={release.modversion}>
            <ModReleaseItem release={release} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
