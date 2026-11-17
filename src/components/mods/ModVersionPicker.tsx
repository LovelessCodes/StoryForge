import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useReleaseSizes } from "@/hooks/use-release-sizes";
import type { ModInfo, Release } from "@/lib/types";

import { ModChangelog } from "./ModChangelog";

/**
 * One release row: version, game tag(s), download count and, once resolved,
 * the size of the release file.
 */
export function ModReleaseItem({ release, size }: { release: Release; size?: string }) {
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
        {size ? ` · ${size}` : null}
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
  // Sizes are resolved once the list is opened: without that, showing a mod
  // would HEAD every release it ever published.
  const [sizesRequested, setSizesRequested] = useState(false);
  const sizes = useReleaseSizes(releases, sizesRequested);
  const sizeFor = (release: Release) => sizes.data?.get(release.mainfile);
  const selectedSize = selected ? sizeFor(selected) : undefined;
  return (
    <div className="grid gap-2">
      <Select
        onOpenChange={(open) => {
          if (open) setSizesRequested(true);
        }}
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
                  {selectedSize ? ` · ${selectedSize}` : null}
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
              <ModReleaseItem release={release} size={sizeFor(release)} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected?.changelog && selected.changelog.trim().length > 0 && (
        <div className="bg-muted/30 border p-2">
          <p className="text-muted-foreground mb-1 text-[10px] font-medium tracking-widest uppercase">
            {t("mods.versionPicker.changelog")}
          </p>
          <ModChangelog
            className="max-h-36 overflow-y-auto text-[11px]"
            html={selected.changelog}
          />
        </div>
      )}
    </div>
  );
}

/** Version field with release picker and loading hint, shared by the add/update sheets. */
export function ModVersionSection({
  modInfo,
  onSelect,
  selected,
}: {
  modInfo: ModInfo | undefined;
  selected: Release | null;
  onSelect: (release: Release | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 p-4">
      <div className="grid gap-1.5">
        <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
          {t("common.fields.version")}
        </p>
        <ModVersionPicker
          onSelect={onSelect}
          releases={modInfo?.mod.releases}
          selected={selected}
        />
      </div>
      {!modInfo && <p className="text-muted-foreground text-xs">{t("mods.loadingReleases")}</p>}
    </div>
  );
}
