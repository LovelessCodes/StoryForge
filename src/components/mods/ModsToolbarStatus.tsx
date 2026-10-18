import { useTranslation } from "react-i18next";

import { InstallModMenu } from "./InstallModMenu";
import { ModsActionsMenu } from "./ModsActionsMenu";
import { UpdateAllButton } from "./UpdateAllButton";
import type { ModsData } from "./use-mods-data";

/**
 * The end of the mods toolbar: how many mods the filters match, plus the
 * actions that operate on the whole installed set.
 */
export function ModsToolbarStatus({
  destinationLabel,
  gameVersion,
  instMods,
  modCount,
  modsDirectory,
  modUpdates,
}: {
  destinationLabel: string;
  gameVersion: string;
  instMods: ModsData["instMods"];
  modCount: number;
  modsDirectory: string | undefined;
  modUpdates: ModsData["modUpdates"];
}) {
  const { t } = useTranslation();

  const showInstalled = !!modsDirectory;
  const updateCount = Object.keys(modUpdates?.updates ?? {}).length;

  return (
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
  );
}
