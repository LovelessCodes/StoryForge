import { UserX } from "lucide-react";
import { useTranslation } from "react-i18next";

import BrokenModsBanner from "./BrokenModsBanner";
import MissingDependenciesBanner from "./MissingDependenciesBanner";
import { ModFiltersBar } from "./ModFiltersBar";
import { ModList } from "./ModList";
import type { SheetRequest } from "./ModSheetHost";
import type { ModsData, ModFiltersState } from "./use-mods-data";

/** The browse tab: filters, banners about the installed mods, and the list. */
export function ModsBrowseView({
  canToggleMods,
  data,
  destinationLabel,
  filters,
  gameVersion,
  onBlockedOpen,
  onOpenSheet,
  profilePath,
}: {
  canToggleMods: boolean;
  data: ModsData;
  destinationLabel: string;
  filters: ModFiltersState;
  gameVersion: string;
  onBlockedOpen: () => void;
  onOpenSheet: (request: SheetRequest) => void;
  profilePath: string | undefined;
}) {
  const { t } = useTranslation();

  return (
    <>
      <ModFiltersBar
        destinationLabel={destinationLabel}
        filters={filters}
        gameVersion={gameVersion}
        gameVersions={data.gameVersions}
        instMods={data.instMods}
        modCount={data.modsList.length}
        modsDirectory={profilePath}
        modTags={data.modTags}
        modUpdates={data.modUpdates}
        onManageBlocked={onBlockedOpen}
      />
      {data.hiddenByBlockCount > 0 && (
        <button
          className="text-muted-foreground hover:text-foreground flex w-fit shrink-0 cursor-pointer items-center gap-1.5 text-xs"
          onClick={onBlockedOpen}
          title={t("mods.blocked.manage")}
          type="button"
        >
          <UserX className="size-3.5" />
          {t("mods.blocked.hidden", { count: data.hiddenByBlockCount })}
        </button>
      )}
      {profilePath && (
        <MissingDependenciesBanner
          destinationLabel={destinationLabel}
          missing={data.missingDependencies}
          modsDirectory={profilePath}
        />
      )}
      {profilePath && (
        <BrokenModsBanner
          destinationLabel={destinationLabel}
          duplicates={data.duplicateMods}
          errors={data.modErrors}
          modsDirectory={profilePath}
        />
      )}
      <ModList
        canToggleMods={canToggleMods}
        destinationLabel={destinationLabel}
        installedMods={profilePath ? (data.instMods?.mods ?? []) : []}
        mods={data.modsList}
        modsDirectory={profilePath}
        modUpdates={profilePath ? data.modUpdates : undefined}
        onAdd={(mod) => onOpenSheet({ kind: "add", mod })}
        onAuthorClick={filters.setAuthor}
        onRemove={(mod, installedMod) => onOpenSheet({ kind: "remove", mod, installedMod })}
        onStandaloneInstall={(mod) => onOpenSheet({ kind: "standalone", mod })}
        onTagClick={filters.handleTagClick}
        onUpdate={(mod, installedMod) => onOpenSheet({ kind: "update", mod, installedMod })}
        selectedTagNames={filters.selectedTagNames}
        tagByName={data.tagByName}
        tagColorMap={data.tagColorMap}
      />
    </>
  );
}
