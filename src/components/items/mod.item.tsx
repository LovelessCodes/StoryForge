import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  DownloadCloudIcon,
  PackageMinusIcon,
  PackagePlusIcon,
  PackageSearchIcon,
} from "lucide-react";
import * as m from "motion/react-m";
import { useRef } from "react";
import { toast } from "sonner";

import { AddModDialog } from "@/components/dialogs/addmod.dialog";
import { RemoveModDialog } from "@/components/dialogs/removemod.dialog";
import { StandaloneInstallPickerDialog } from "@/components/dialogs/standalone-install-picker.dialog";
import { UpdateModDialog } from "@/components/dialogs/updatemod.dialog";
import type { Mod } from "@/components/lists/mod.list";
import type { OutputMod } from "@/components/pages/mods-browser";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootAlertDialogHandle, rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useAddLatestModVersion } from "@/hooks/use-add-latest-mod-version";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import type { ModInfo, ModTag, ProgressPayload } from "@/lib/types";
import { cn, compareSemverAsc, hashPath, pathDelimiter } from "@/lib/utils";

/** Label of the folder a mod is being installed to or removed from. */
function destinationLabel(modsDirectory: string | undefined): string {
  if (!modsDirectory) return "destination";
  return modsDirectory.split(pathDelimiter).pop() || modsDirectory;
}

/** Upgrade/downgrade wording for the toast messages. */
function changeWording(installedMod: OutputMod | undefined, updateMod: ModUpdate | undefined) {
  const isUpgrade = Boolean(
    installedMod && updateMod && updateMod.modversion > installedMod.version,
  );
  return {
    gerund: isUpgrade ? "upgrading" : "downgrading",
    Gerund: isUpgrade ? "Upgrading" : "Downgrading",
    past: isUpgrade ? "updated" : "downgraded",
  };
}

export function ModItem({
  mod,
  installedMods,
  modUpdates,
  modsDirectory,
  tagColorMap,
  tagByName,
  selectedTagNames,
  onTagClick,
  onAuthorClick,
}: {
  mod: Mod;
  installedMods: OutputMod[];
  modUpdates: ModUpdatesResponse | undefined;
  modsDirectory?: string;
  tagColorMap: Record<string, string>;
  tagByName: Record<string, ModTag>;
  selectedTagNames: Set<string>;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  onAuthorClick: (author: string) => void;
}) {
  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);
  const pathHash = modsDirectory ? hashPath(modsDirectory) : "standalone";
  const emitevent = `mod-download-${mod.modid}-${pathHash}`;

  const modIdStrings = new Set(mod.modidstrs);
  const installedMod = installedMods.find(
    (i) => i.modid === String(mod.modid) || modIdStrings.has(i.modid),
  );
  const updateMod =
    modUpdates?.updates[mod.modidstrs[0]] ??
    modUpdates?.updates[mod.modid.toString()] ??
    modUpdates?.updates[mod.assetid.toString()] ??
    modUpdates?.updates[mod.urlalias ?? ""];

  const { data: modInfo } = useQuery({
    enabled: !!updateMod,
    queryFn: () =>
      updateMod &&
      (invoke("fetch_mod_info", {
        modid: updateMod?.modidstr,
      }) as Promise<ModInfo>),
    queryKey: ["modInfo", mod.modid],
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const { mutate: downloadLatestModVersion, isPending: isDownloading } = useAddLatestModVersion({
    modsDirectory,
    mod,
  });

  const { mutate: removeModFromInstallation, isPending: removePending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
      invoke("remove_mod_from_installation", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(
        `Error removing ${variables.modpath} from ${destinationLabel(modsDirectory)}: ${error.message}`,
        { id: `mod-remove-${variables.path}-${variables.modpath}` },
      );
    },
    onSuccess: async () => {
      if (!modsDirectory) return;
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      addModToInstallation({
        path: `${modsDirectory}${pathDelimiter}Mods`,
        url: updateMod?.mainfile || "",
      });
    },
  });

  const { mutate: addModToInstallation, isPending } = useMutation({
    mutationFn: ({ path, url }: { path: string; url: string }) =>
      invoke("download_and_maybe_extract", {
        params: {
          destpath: path,
          emitevent,
          extract: false,
          url,
        },
      }) as Promise<string>,
    onError: (error) => {
      const wording = changeWording(installedMod, updateMod);
      toast.error(
        `Error ${wording.gerund} ${modInfo?.mod.name} to ${destinationLabel(modsDirectory)}: ${error.message}`,
        { id: `add-mod-${modInfo?.mod.modid}-${pathHash}` },
      );
      listenRef.current?.();
    },
    onMutate: async () => {
      const wording = changeWording(installedMod, updateMod);
      const label = destinationLabel(modsDirectory);
      toast.loading(`${wording.Gerund} ${modInfo?.mod.name} to ${label}...`, {
        id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
      });
      listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(`Downloading ${modInfo?.mod.name} to ${label}... ${percent?.toFixed(0)}%`, {
            id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
          });
        }
      });
    },
    onSuccess: async () => {
      if (!modsDirectory) return;
      listenRef.current?.();
      toast.success(
        `Successfully ${changeWording(installedMod, updateMod).past} ${modInfo?.mod.name} to ${destinationLabel(modsDirectory)}`,
        { id: `add-mod-${modInfo?.mod.modid}-${pathHash}` },
      );
      void queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(modsDirectory),
      });
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory),
      });
    },
  });

  const canUpdate = Boolean(
    updateMod &&
    modsDirectory &&
    installedMod &&
    compareSemverAsc(updateMod.modversion, installedMod.version) > 0,
  );

  return (
    <m.div
      animate={{ opacity: 1, y: 0 }}
      className={cn([
        "flex flex-row p-2 justify-between w-full items-center",
        installedMod && modsDirectory && "bg-linear-to-r from-success/20 to-transparent",
      ])}
      exit={{ opacity: 0, y: 12 }}
      initial={{ opacity: 0, y: 12 }}
    >
      <ModSummary
        mod={mod}
        onAuthorClick={onAuthorClick}
        onTagClick={onTagClick}
        selectedTagNames={selectedTagNames}
        tagByName={tagByName}
        tagColorMap={tagColorMap}
      />
      <Group>
        <ModPrimaryAction
          actionPending={isPending}
          canUpdate={canUpdate}
          installedMod={installedMod}
          isDownloading={isDownloading}
          mod={mod}
          modsDirectory={modsDirectory}
          onDownloadLatest={() =>
            downloadLatestModVersion({
              path: `${modsDirectory}${pathDelimiter}Mods`,
            })
          }
          onUpdate={() =>
            removeModFromInstallation({
              modpath: installedMod?.path ?? "",
              path: modsDirectory ?? "",
            })
          }
          removePending={removePending}
          updateMod={updateMod}
        />
        <ModManageActions
          installedMod={installedMod}
          mod={mod}
          modsDirectory={modsDirectory}
          removePending={removePending}
        />
      </Group>
    </m.div>
  );
}

/** Logo, name, author, summary, counts and tags. */
function ModSummary({
  mod,
  onAuthorClick,
  onTagClick,
  selectedTagNames,
  tagByName,
  tagColorMap,
}: {
  mod: Mod;
  onAuthorClick: (author: string) => void;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  selectedTagNames: Set<string>;
  tagByName: Record<string, ModTag>;
  tagColorMap: Record<string, string>;
}) {
  const modUrl = `https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`;

  return (
    <div className="flex flex-row gap-2">
      <a href={modUrl} rel="noreferrer" target="_blank">
        <img
          alt={mod.name}
          className="size-12 rounded transition-transform hover:scale-105"
          loading="lazy"
          src={mod.logo ?? "https://mods.vintagestory.at/web/img/mod-default.png"}
        />
      </a>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <a
            className="font-semibold hover:underline"
            href={modUrl}
            rel="noreferrer"
            target="_blank"
          >
            <h3 className="font-semibold">{mod.name}</h3>
          </a>
          <p className="text-xs opacity-50">by</p>
          <TooltipTrigger
            render={
              <button
                aria-label={`Filter by ${mod.author}`}
                className="cursor-pointer text-xs text-orange-200 opacity-50"
                onClick={() => onAuthorClick(mod.author)}
                type="button"
              />
            }
            handle={rootTooltipHandle}
            payload={() => `Click to filter by author ${mod.author}`}
          >
            {mod.author}
          </TooltipTrigger>
        </div>
        <p className="text-muted-foreground line-clamp-1 text-sm">{mod.summary}</p>
        <div className="text-muted-foreground mt-1 flex gap-2 text-xs">
          <span>{mod.downloads} downloads</span>
          <span>{mod.follows} follows</span>
          <span>{mod.comments} comments</span>
        </div>
        {mod.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {mod.tags.map((tagName) => (
              <ModTagChip
                isActive={selectedTagNames.has(tagName)}
                key={tagName}
                onTagClick={onTagClick}
                tag={tagByName[tagName]}
                tagColor={tagColorMap[tagName]}
                tagName={tagName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModTagChip({
  isActive,
  onTagClick,
  tag,
  tagColor,
  tagName,
}: {
  isActive: boolean;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  tag: ModTag | undefined;
  tagColor: string | undefined;
  tagName: string;
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center rounded px-1.5 py-px text-[10px] leading-relaxed font-medium transition-opacity hover:opacity-80",
        isActive && "ring-1 ring-primary",
      )}
      onClick={() => {
        if (!tag) return;
        onTagClick(tag, isActive);
      }}
      style={{
        backgroundColor: tagColor ? `${tagColor}20` : undefined,
        border: tagColor ? `1px solid ${tagColor}50` : undefined,
        color: tagColor ?? undefined,
      }}
      type="button"
    >
      {tagName}
    </button>
  );
}

/** Update-to-latest action, or the install action when the mod is absent. */
function ModPrimaryAction({
  actionPending,
  canUpdate,
  installedMod,
  isDownloading,
  mod,
  modsDirectory,
  onDownloadLatest,
  onUpdate,
  removePending,
  updateMod,
}: {
  actionPending: boolean;
  canUpdate: boolean;
  installedMod: OutputMod | undefined;
  isDownloading: boolean;
  mod: Mod;
  modsDirectory: string | undefined;
  onDownloadLatest: () => void;
  onUpdate: () => void;
  removePending: boolean;
  updateMod: ModUpdate | undefined;
}) {
  if (canUpdate && installedMod && updateMod) {
    return (
      <>
        <TooltipTrigger
          render={
            <Button
              aria-label="Update to Latest Version"
              disabled={actionPending || removePending}
              onClick={onUpdate}
              size="icon"
              variant="outline"
            >
              <DownloadCloudIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (
            <>
              <span className="text-muted-foreground text-xs">
                {installedMod.version} → {updateMod.modversion ?? "Unknown"}
              </span>
              <br />
              Install latest version
            </>
          )}
        />
        <GroupSeparator />
      </>
    );
  }
  if (installedMod) return null;
  return (
    <>
      {modsDirectory ? (
        <TooltipTrigger
          render={
            <Button
              aria-label="Download Latest Version"
              disabled={isDownloading}
              onClick={onDownloadLatest}
              size="icon"
              variant="outline"
            >
              <DownloadCloudIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Install latest version"}
        />
      ) : (
        <TooltipTrigger
          render={
            <Button
              aria-label="Install to..."
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <StandaloneInstallPickerDialog modid={mod.modid} mod={mod} />}
                />
              }
              size="icon"
              variant="outline"
            >
              <DownloadCloudIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Install to Installation or Hosted Server"}
        />
      )}
      <GroupSeparator />
    </>
  );
}

/** Version picker for installed mods, plus remove / add / install. */
function ModManageActions({
  installedMod,
  mod,
  modsDirectory,
  removePending,
}: {
  installedMod: OutputMod | undefined;
  mod: Mod;
  modsDirectory: string | undefined;
  removePending: boolean;
}) {
  if (modsDirectory && installedMod) {
    return (
      <>
        <TooltipTrigger
          render={
            <Button
              aria-label="Update"
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => (
                    <UpdateModDialog
                      mod={installedMod}
                      modsDirectory={modsDirectory}
                      versionFrom={installedMod.version}
                    />
                  )}
                />
              }
              size="icon"
              variant="outline"
            >
              <PackageSearchIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Look through available versions"}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              aria-label="Remove"
              disabled={removePending}
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => (
                    <RemoveModDialog
                      modsDirectory={modsDirectory}
                      name={mod.name}
                      path={installedMod.path ?? ""}
                    />
                  )}
                />
              }
              size="icon"
              variant="destructive-outline"
            >
              <PackageMinusIcon
                aria-hidden="true"
                className="text-destructive opacity-60"
                size={16}
              />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Remove"}
        />
      </>
    );
  }
  if (modsDirectory) {
    return (
      <TooltipTrigger
        render={
          <Button
            aria-label="Add Mod"
            render={
              <DialogTrigger
                handle={rootDialogHandle}
                payload={() => <AddModDialog modsDirectory={modsDirectory} modid={mod.modid} />}
              />
            }
            size="icon"
            variant="outline"
          >
            <PackagePlusIcon aria-hidden="true" className="opacity-60" size={16} />
          </Button>
        }
        handle={rootTooltipHandle}
        payload={() => "Add Mod"}
      />
    );
  }
  if (installedMod) return null;
  return (
    <TooltipTrigger
      render={
        <Button
          aria-label="Install Mod"
          render={
            <DialogTrigger
              handle={rootDialogHandle}
              payload={() => <StandaloneInstallPickerDialog modid={mod.modid} mod={mod} />}
            />
          }
          size="icon"
          variant="outline"
        >
          <PackagePlusIcon aria-hidden="true" className="opacity-60" size={16} />
        </Button>
      }
      handle={rootTooltipHandle}
      payload={() => "Install to Installation or Hosted Server"}
    />
  );
}
