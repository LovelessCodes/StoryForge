import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DownloadCloudIcon,
  ExternalLink,
  EyeOff,
  PackageMinusIcon,
  PackagePlusIcon,
  PackageSearchIcon,
  Pin,
  PinOff,
  Power,
  PowerOff,
  SkipForward,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModUpdate } from "@/hooks/use-mod-updates";
import { pathDelimiter } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, OutputMod } from "@/lib/types";

type ModActionsProps = {
  canToggleMods: boolean;
  canUpdate: boolean;
  clearModUpdateSkip: (modidstr: string) => void;
  destinationLabel: string;
  downloadLatest: (variables: { path: string }) => void;
  favoriteKey: string;
  installedMod: OutputMod | undefined;
  isDisabled: boolean;
  isDownloading: boolean;
  isFavorite: boolean;
  mod: Mod;
  modsDirectory?: string;
  onAdd: (mod: Mod) => void;
  onRemove: (mod: Mod, installedMod: OutputMod) => void;
  onStandaloneInstall: (mod: Mod) => void;
  onUpdate: (mod: Mod, installedMod: OutputMod) => void;
  pinned: boolean;
  removeThenUpdate: (variables: { path: string; modpath: string; update: ModUpdate }) => void;
  removeUpdatePending: boolean;
  setModEnabled: (variables: {
    modid: string;
    version: string;
    enabled: boolean;
    name: string;
  }) => void;
  skippedVersion: string | undefined;
  skipModUpdate: (modidstr: string, version: string) => void;
  statePending: boolean;
  toggleFavoriteMod: (modidstr: string) => void;
  toggleModPin: (path: string, modid: string) => void;
  updateMod: ModUpdate | undefined;
  updatePending: boolean;
};

/**
 * The action column of a mod row. Favourite and ModDB shortcuts are always
 * shown; the install/update button and the profile actions then depend on
 * whether the mod is installed and whether an update is waiting.
 */
export function ModActions({
  canToggleMods,
  canUpdate,
  clearModUpdateSkip,
  destinationLabel,
  downloadLatest,
  favoriteKey,
  installedMod,
  isDisabled,
  isDownloading,
  isFavorite,
  mod,
  modsDirectory,
  onAdd,
  onRemove,
  onStandaloneInstall,
  onUpdate,
  pinned,
  removeThenUpdate,
  removeUpdatePending,
  setModEnabled,
  skippedVersion,
  skipModUpdate,
  statePending,
  toggleFavoriteMod,
  toggleModPin,
  updateMod,
  updatePending,
}: ModActionsProps) {
  const { t } = useTranslation();
  const favoriteLabel = isFavorite ? "mods.item.unfavorite" : "mods.item.favorite";

  return (
    <div className="flex shrink-0 items-center gap-1.5 self-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t(favoriteLabel)}
              onClick={() => toggleFavoriteMod(favoriteKey)}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Star
            className={
              isFavorite
                ? "fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]"
                : undefined
            }
          />
        </TooltipTrigger>
        <TooltipContent>{t(favoriteLabel)}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("mods.item.openOnModDB")}
              onClick={() =>
                void openUrl(`https://mods.vintagestory.at/${mod.urlalias ?? mod.modid}`)
              }
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <ExternalLink />
        </TooltipTrigger>
        <TooltipContent>{t("mods.item.openOnModDB")}</TooltipContent>
      </Tooltip>
      <ModPrimaryAction
        canUpdate={canUpdate}
        clearModUpdateSkip={clearModUpdateSkip}
        downloadLatest={downloadLatest}
        favoriteKey={favoriteKey}
        installedMod={installedMod}
        isDownloading={isDownloading}
        mod={mod}
        modsDirectory={modsDirectory}
        onStandaloneInstall={onStandaloneInstall}
        removeThenUpdate={removeThenUpdate}
        removeUpdatePending={removeUpdatePending}
        skippedVersion={skippedVersion}
        skipModUpdate={skipModUpdate}
        updateMod={updateMod}
        updatePending={updatePending}
      />
      <ModProfileActions
        canToggleMods={canToggleMods}
        destinationLabel={destinationLabel}
        installedMod={installedMod}
        isDisabled={isDisabled}
        mod={mod}
        modsDirectory={modsDirectory}
        onAdd={onAdd}
        onRemove={onRemove}
        onStandaloneInstall={onStandaloneInstall}
        onUpdate={onUpdate}
        pinned={pinned}
        setModEnabled={setModEnabled}
        statePending={statePending}
        toggleModPin={toggleModPin}
      />
    </div>
  );
}

/**
 * The replaceable install/update slot: an update plus its skip button, the
 * "restore skipped update" button, a download-to-profile button, or the
 * standalone install picker, in that order of precedence.
 */
function ModPrimaryAction({
  canUpdate,
  clearModUpdateSkip,
  downloadLatest,
  favoriteKey,
  installedMod,
  isDownloading,
  mod,
  modsDirectory,
  onStandaloneInstall,
  removeThenUpdate,
  removeUpdatePending,
  skippedVersion,
  skipModUpdate,
  updateMod,
  updatePending,
}: Pick<
  ModActionsProps,
  | "canUpdate"
  | "clearModUpdateSkip"
  | "downloadLatest"
  | "favoriteKey"
  | "installedMod"
  | "isDownloading"
  | "mod"
  | "modsDirectory"
  | "onStandaloneInstall"
  | "removeThenUpdate"
  | "removeUpdatePending"
  | "skippedVersion"
  | "skipModUpdate"
  | "updateMod"
  | "updatePending"
>) {
  const { t } = useTranslation();

  if (canUpdate && installedMod && updateMod) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("mods.item.updateToLatest")}
                disabled={removeUpdatePending || updatePending}
                onClick={() =>
                  removeThenUpdate({
                    path: modsDirectory ?? "",
                    modpath: installedMod.path,
                    update: updateMod,
                  })
                }
                size="icon-sm"
                variant="outline-accent-primary"
              />
            }
          >
            <DownloadCloudIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            <span className="grid gap-0.5">
              <span className="font-mono">
                {installedMod.version} → {updateMod.modversion}
              </span>
              <span>{t("mods.item.updateToLatest")}</span>
            </span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("mods.updates.skipTooltip", { version: updateMod.modversion })}
                onClick={() => {
                  skipModUpdate(favoriteKey, updateMod.modversion);
                  toast.info(
                    t("mods.updates.skippedToast", {
                      name: mod.name,
                      version: updateMod.modversion,
                    }),
                  );
                }}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <SkipForward aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {t("mods.updates.skipTooltip", { version: updateMod.modversion })}
          </TooltipContent>
        </Tooltip>
      </>
    );
  }

  if (installedMod) {
    if (!skippedVersion) return null;

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("mods.updates.skippedTooltip", { version: skippedVersion })}
              onClick={() => {
                clearModUpdateSkip(favoriteKey);
                toast.info(t("mods.updates.restoredToast", { name: mod.name }));
              }}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <EyeOff aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          {t("mods.updates.skippedTooltip", { version: skippedVersion })}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (modsDirectory) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("mods.item.downloadLatest")}
              disabled={isDownloading}
              onClick={() => downloadLatest({ path: `${modsDirectory}${pathDelimiter}Mods` })}
              size="icon-sm"
              variant="outline"
            />
          }
        >
          <DownloadCloudIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{t("mods.item.installLatest")}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("mods.item.installTo")}
            onClick={() => onStandaloneInstall(mod)}
            size="icon-sm"
            variant="outline-accent-primary"
          />
        }
      >
        <DownloadCloudIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{t("mods.item.installToDestination")}</TooltipContent>
    </Tooltip>
  );
}

/** The profile actions: installed-mod actions, add, or standalone install. */
function ModProfileActions({
  canToggleMods,
  destinationLabel,
  installedMod,
  isDisabled,
  mod,
  modsDirectory,
  onAdd,
  onRemove,
  onStandaloneInstall,
  onUpdate,
  pinned,
  setModEnabled,
  statePending,
  toggleModPin,
}: Pick<
  ModActionsProps,
  | "canToggleMods"
  | "destinationLabel"
  | "installedMod"
  | "isDisabled"
  | "mod"
  | "modsDirectory"
  | "onAdd"
  | "onRemove"
  | "onStandaloneInstall"
  | "onUpdate"
  | "pinned"
  | "setModEnabled"
  | "statePending"
  | "toggleModPin"
>) {
  const { t } = useTranslation();

  if (modsDirectory && installedMod) {
    return (
      <ModInstalledActions
        canToggleMods={canToggleMods}
        destinationLabel={destinationLabel}
        installedMod={installedMod}
        isDisabled={isDisabled}
        mod={mod}
        modsDirectory={modsDirectory}
        onRemove={onRemove}
        onUpdate={onUpdate}
        pinned={pinned}
        setModEnabled={setModEnabled}
        statePending={statePending}
        toggleModPin={toggleModPin}
      />
    );
  }

  if (modsDirectory) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("mods.item.add")}
              onClick={() => onAdd(mod)}
              size="icon-sm"
              variant="outline"
            />
          }
        >
          <PackagePlusIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{t("mods.item.addTo", { destination: destinationLabel })}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("mods.item.install")}
            onClick={() => onStandaloneInstall(mod)}
            size="icon-sm"
            variant="outline"
          />
        }
      >
        <PackagePlusIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{t("mods.item.installToDestination")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Enable/disable, pin, browse versions and remove for an installed mod. Only
 * rendered when the mod is installed in a profile, so `installedMod` and
 * `modsDirectory` arrive narrowed to defined values.
 */
function ModInstalledActions({
  canToggleMods,
  destinationLabel,
  installedMod,
  isDisabled,
  mod,
  modsDirectory,
  onRemove,
  onUpdate,
  pinned,
  setModEnabled,
  statePending,
  toggleModPin,
}: Pick<
  ModActionsProps,
  | "canToggleMods"
  | "destinationLabel"
  | "installedMod"
  | "isDisabled"
  | "mod"
  | "modsDirectory"
  | "onRemove"
  | "onUpdate"
  | "pinned"
  | "setModEnabled"
  | "statePending"
  | "toggleModPin"
> & { installedMod: OutputMod; modsDirectory: string }) {
  const { t } = useTranslation();

  return (
    <>
      {canToggleMods && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={isDisabled ? t("mods.item.enable") : t("mods.item.disable")}
                disabled={statePending}
                onClick={() =>
                  setModEnabled({
                    modid: installedMod.modid,
                    version: installedMod.version,
                    enabled: isDisabled,
                    name: mod.name,
                  })
                }
                size="icon-sm"
                variant={isDisabled ? "outline" : "ghost"}
              />
            }
          >
            {isDisabled ? <Power aria-hidden="true" /> : <PowerOff aria-hidden="true" />}
          </TooltipTrigger>
          <TooltipContent>
            {isDisabled
              ? t("mods.item.enableTooltip", { name: mod.name })
              : t("mods.item.disableTooltip", { name: mod.name })}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={pinned ? t("mods.item.unpin") : t("mods.item.pin")}
              onClick={() => toggleModPin(modsDirectory, installedMod.modid)}
              size="icon-sm"
              variant={pinned ? "outline-amber" : "outline"}
            />
          }
        >
          {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
        </TooltipTrigger>
        <TooltipContent>
          {pinned
            ? t("mods.item.pinnedTooltip", { version: installedMod.version })
            : t("mods.item.pinTooltip", { version: installedMod.version })}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("mods.item.browseVersions")}
              onClick={() => onUpdate(mod, installedMod)}
              size="icon-sm"
              variant="outline"
            />
          }
        >
          <PackageSearchIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{t("mods.item.browseVersionsTooltip")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={t("common.actions.remove")}
              onClick={() => onRemove(mod, installedMod)}
              size="icon-sm"
              variant="destructive"
            />
          }
        >
          <PackageMinusIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>
          {t("mods.item.removeFrom", { destination: destinationLabel })}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
