import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { OutputMod } from "@/components/pages/mods-browser";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { rootDialogHandle } from "@/handles";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ProgressPayload } from "@/lib/types";
import { hashPath, pathDelimiter } from "@/lib/utils";

type Release = {
  releaseid: number;
  mainfile: string;
  filename: string;
  fileid: number;
  downloads: number;
  tags: string[];
  modidstr: string;
  modversion: string;
  created: string;
  changelog: string | null;
};

type ModInfo = {
  mod: {
    modid: number;
    assetid: number;
    name: string;
    text: string;
    author: string;
    urlalias: string;
    logofilename: string | null;
    logofile: string | null;
    logofiledb: string | null;
    homepageurl: string | null;
    sourcecodeurl: string | null;
    trailervideourl: string | null;
    issuetrackerurl: string | null;
    wikiurl: string | null;
    downloads: number;
    follows: number;
    trendingpoints: number;
    comments: number;
    side: string;
    type: string;
    created: string;
    lastreleased: string;
    lastmodified: string;
    tags: string[];
    releases: Release[];
    screenshots: string[];
  };
  statuscode: string;
};

export type UpdateModDialogProps = {
  mod: OutputMod;
  modsDirectory: string;
  versionFrom: string;
};

export function UpdateModDialog({ mod, modsDirectory, versionFrom }: UpdateModDialogProps) {
  const { data: modInfo } = useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid: mod.modid }) as Promise<ModInfo>,
    queryKey: ["modInfo", mod.modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const listenRef = useRef<UnlistenFn>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion =
    userSelectedVersion ??
    (versionFrom
      ? (modInfo?.mod.releases.find((r) => r.modversion === versionFrom) ?? null)
      : null);
  const queryClient = useQueryClient();
  const pathHash = hashPath(modsDirectory);
  const emitevent = `mod-download-${mod.modid}-${pathHash}`;
  const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;

  const { mutate: removeModFromInstallation, isPending: removePending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string; mainfile: string }) =>
      invoke("remove_mod_from_installation", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(`Error removing ${variables.modpath} from ${label}: ${error.message}`, {
        id: `mod-remove-${variables.path}-${variables.modpath}`,
      });
    },
    onSuccess: async (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      addModToInstallation({
        path: `${modsDirectory}${pathDelimiter}Mods`,
        url: variables.mainfile,
      });
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
        `Error ${selectedVersion && selectedVersion.modversion > versionFrom ? "upgrading" : "downgrading"} ${modInfo?.mod.name} to ${label}: ${error.message}`,
        { id: `add-mod-${modInfo?.mod.modid}-${pathHash}` },
      );
      listenRef.current?.();
    },
    onMutate: async () => {
      toast.loading(
        `${selectedVersion && selectedVersion.modversion > versionFrom ? "Upgrading" : "Downgrading"} ${modInfo?.mod.name} to ${label}...`,
        {
          id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
        },
      );
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
      listenRef.current?.();
      toast.success(
        `Successfully ${selectedVersion && selectedVersion.modversion > versionFrom ? "updated" : "downgraded"} ${modInfo?.mod.name} to ${label}`,
        { id: `add-mod-${modInfo?.mod.modid}-${pathHash}` },
      );
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(modsDirectory),
      });
      void queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(modsDirectory),
      });
      rootDialogHandle.close();
    },
  });

  return (
    <>
      <DialogHeader>
        <h3 className="text-lg leading-6 font-medium">
          {selectedVersion && selectedVersion?.modversion >= versionFrom ? "Update" : "Downgrade"}{" "}
          <span className="text-warning-foreground">{modInfo?.mod.name}</span> in{" "}
          <span className="text-blue-200">{label}</span>
        </h3>
      </DialogHeader>
      <DialogDescription>
        Select the version of <span className="text-warning-foreground">{modInfo?.mod.name}</span>{" "}
        you want to change to, in <span className="text-blue-200">{label}</span>.
      </DialogDescription>
      {/* We need a select, incase the installation version is not compatible */}
      <div className="mt-2 w-full overflow-hidden">
        <Select
          onValueChange={(value) => {
            const release = modInfo?.mod.releases.find((r) => r.modversion === value) || null;
            setUserSelectedVersion(release);
          }}
          value={selectedVersion?.modversion || undefined}
        >
          <SelectTrigger className="w-full truncate">
            <span>
              {selectedVersion?.modversion ? (
                <span>
                  {selectedVersion.modversion}{" "}
                  <span className="text-muted-foreground">
                    for {selectedVersion.tags[0]}{" "}
                    {selectedVersion.tags.length > 1
                      ? `(+${selectedVersion.tags.length - 1} more)`
                      : ""}
                  </span>
                </span>
              ) : (
                "Select Version"
              )}
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {modInfo?.mod.releases.map((release) => (
              <SelectItem key={release.fileid} value={release.modversion}>
                <div className="flex flex-col">
                  <span>
                    {release.modversion}
                    <span className="text-muted-foreground">
                      {" "}
                      for {release.tags[0]}{" "}
                      {release.tags.length > 1 ? `(+${release.tags.length - 1} more)` : ""}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {release.downloads} downloads
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button
          disabled={
            !selectedVersion ||
            isPending ||
            removePending ||
            selectedVersion.modversion === versionFrom
          }
          onClick={async () => {
            if (selectedVersion && selectedVersion.modversion !== versionFrom) {
              removeModFromInstallation({
                mainfile: selectedVersion.mainfile,
                modpath: mod.path,
                path: modsDirectory,
              });
            }
          }}
        >
          {selectedVersion && selectedVersion?.modversion >= versionFrom ? "Update" : "Downgrade"}{" "}
          Mod
        </Button>
      </DialogFooter>
    </>
  );
}
