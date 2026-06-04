import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  DownloadCloudIcon,
  PackageMinusIcon,
  PackagePlusIcon,
  PackageSearchIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { toast } from "sonner";

import { AddModDialog } from "@/components/dialogs/addmod.dialog";
import { RemoveModDialog } from "@/components/dialogs/removemod.dialog";
import { UpdateModDialog } from "@/components/dialogs/updatemod.dialog";
import type { Mod } from "@/components/lists/mod.list";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useAddLatestModVersion } from "@/hooks/use-add-latest-mod-version";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { type ModUpdatesResponse, modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import { cn, compareSemverAsc, pathDelimiter } from "@/lib/utils";
import { rootAlertDialogHandle, rootDialogHandle, rootTooltipHandle } from "@/routes/__root";
import type { OutputMod } from "@/routes/install-mods/$id";
import type { Installation } from "@/stores/installations";
import { useModsFilters } from "@/stores/modsFilters";

export function ModItem({
  mod,
  installedMods,
  modUpdates,
  installation,
}: {
  mod: Mod;
  installedMods: OutputMod[];
  modUpdates: ModUpdatesResponse | undefined;
  installation: Installation | null;
}) {
  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);
  const emitevent = `mod-download-${mod.modid}-${installation?.id}`;
  const installedMod = installedMods.find(
    (i) => i.modid === mod.modid || mod.modidstrs.includes(i.modid.toString()),
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
    installation,
    mod,
  });
  const { mutate: removeModFromInstallation, isPending: removePending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
      invoke("remove_mod_from_installation", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(
        `Error removing ${variables.modpath} from ${installation?.name}: ${error.message}`,
        {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        },
      );
    },
    onSuccess: async () => {
      if (installation) {
        await queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(installation.id) });
        await queryClient.invalidateQueries({ queryKey: installedModsQueryKey(installation.path) });
        addModToInstallation({
          path: `${installation.path}${pathDelimiter}Mods`,
          url: updateMod?.mainfile || "",
        });
      }
    },
  });
  const { mutate: addModToInstallation, isPending } = useMutation({
    mutationFn: ({ path, url }: { path: string; url: string }) =>
      invoke("download_and_maybe_extract", {
        destpath: path,
        emitevent,
        extract: false,
        url,
      }) as Promise<string>,
    onError: (error) => {
      toast.error(
        `Error ${installedMod && updateMod && updateMod?.modversion > installedMod?.version ? "upgrading" : "downgrading"} ${modInfo?.mod.name} to ${installation?.name}: ${error.message}`,
        { id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
      );
      listenRef.current?.();
    },
    onMutate: async () => {
      toast.loading(
        `${installedMod && updateMod && updateMod.modversion > installedMod.version ? "Upgrading" : "Downgrading"} ${modInfo?.mod.name} to ${installation?.name}...`,
        {
          id: `add-mod-${modInfo?.mod.modid}-${installation?.id}`,
        },
      );
      listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${modInfo?.mod.name} to ${installation?.name}... ${percent?.toFixed(0)}%`,
            { id: `add-mod-${modInfo?.mod.modid}-${installation?.id}` },
          );
        }
      });
    },
    onSuccess: async () => {
      if (installation === null) return;
      listenRef.current?.();
      toast.success(
        `Successfully ${installedMod && updateMod && updateMod.modversion > installedMod.version ? "updated" : "downgraded"} ${modInfo?.mod.name} to ${installation.name}`,
        { id: `add-mod-${modInfo?.mod.modid}-${installation.id}` },
      );
      await queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(installation.id),
      });
      await queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(installation.path),
      });
    },
  });
  const { setAuthor } = useModsFilters();
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn([
        "flex flex-row p-2 justify-between w-full items-center",
        installedMod && "bg-gradient-to-r from-success/20 to-transparent",
      ])}
      exit={{ opacity: 0, y: 12 }}
      initial={{ opacity: 0, y: 12 }}
    >
      <div className="flex flex-row gap-2">
        <a
          href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
          rel="noreferrer"
          target="_blank"
        >
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
              href={`https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`}
              rel="noreferrer"
              target="_blank"
            >
              <h3 className="font-semibold">{mod.name}</h3>
            </a>
            <p className="text-xs opacity-50">by</p>
            <TooltipTrigger
              render={
                <span
                  aria-label={`Filter by ${mod.author}`}
                  className="cursor-pointer text-xs text-orange-200 opacity-50"
                  onClick={() => setAuthor(mod.author)}
                  onKeyUp={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setAuthor(mod.author);
                    }
                  }}
                  role="button"
                  tabIndex={0}
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
        </div>
      </div>
      <Group>
        {updateMod &&
          installation &&
          updateMod &&
          installedMod &&
          compareSemverAsc(updateMod.modversion, installedMod.version) > 0 && (
            <>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Update to Latest Version"
                    disabled={isPending || removePending}
                    onClick={() =>
                      removeModFromInstallation({
                        modpath: installedMod?.path ?? "",
                        path: installation.path,
                      })
                    }
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
          )}
        {!installedMod && installation && (
          <>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Download Latest Version"
                  disabled={isDownloading}
                  onClick={() =>
                    downloadLatestModVersion({
                      path: `${installation.path}${pathDelimiter}Mods`,
                    })
                  }
                  size="icon"
                  variant="outline"
                >
                  <DownloadCloudIcon aria-hidden="true" className="opacity-60" size={16} />
                </Button>
              }
              handle={rootTooltipHandle}
              payload={() => "Install latest version"}
            />
            <GroupSeparator />
          </>
        )}
        {installation && installedMod && (
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
                          installation={installation}
                          mod={installedMod}
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
          </>
        )}
        {installation &&
          (installedMod ? (
            <TooltipTrigger
              render={
                <Button
                  aria-label="Remove"
                  render={
                    <AlertDialogTrigger
                      handle={rootAlertDialogHandle}
                      payload={() => (
                        <RemoveModDialog
                          installation={installation}
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
          ) : (
            <TooltipTrigger
              render={
                <Button
                  aria-label="Add Mod"
                  render={
                    <DialogTrigger
                      handle={rootDialogHandle}
                      payload={() => <AddModDialog installation={installation} modid={mod.modid} />}
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
          ))}
      </Group>
    </motion.div>
  );
}
