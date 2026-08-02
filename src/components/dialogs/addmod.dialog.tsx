import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { rootDialogHandle } from "@/handles";
import { useAddModToInstallation } from "@/hooks/use-add-mod-to-installation";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload, Release } from "@/lib/types";
import { hashPath, latestRelease } from "@/lib/utils";

export type AddModDialogProps = {
  modid: number;
  modsDirectory: string;
};

export function AddModDialog({ modid, modsDirectory }: AddModDialogProps) {
  const { data: modInfo } = useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid: modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const listenRef = useRef<UnlistenFn>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;
  const queryClient = useQueryClient();
  const pathHash = hashPath(modsDirectory);
  const { mutate: addModToInstallation } = useAddModToInstallation({
    onError: (error, variables) => {
      const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;
      toast.error(`Error adding ${variables.mod.mod.name} to ${label}: ${error.message}`, {
        id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
      });
      listenRef.current?.();
    },
    onMutate: async (variables) => {
      const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;
      toast.loading(`Adding ${variables.mod.mod.name} to ${label}...`, {
        id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
      });
      listenRef.current = await listen<ProgressPayload>(variables.emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${variables.mod.mod.name} to ${label}... ${percent?.toFixed(0)}%`,
            {
              id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
            },
          );
        }
      });
    },
    onSuccess: async (_, variables) => {
      listenRef.current?.();
      const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;
      toast.success(`Successfully added ${variables.mod.mod.name} to ${label}`, {
        id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
      });
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(variables.modsDirectory),
      });
      void queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(variables.modsDirectory),
      });
      rootDialogHandle.close();
    },
  });

  return (
    <>
      <DialogClose />
      <DialogHeader>
        <h3 className="text-lg leading-6 font-medium">
          Add <span className="text-warning-foreground">{modInfo?.mod.name}</span> to{" "}
          <span className="text-blue-200">
            {modsDirectory.split(/[/\\]/).pop() || modsDirectory}
          </span>
        </h3>
      </DialogHeader>
      <DialogDescription>
        Select the version of <span className="text-warning-foreground">{modInfo?.mod.name}</span>{" "}
        you want to add to{" "}
        <span className="text-blue-200">{modsDirectory.split(/[/\\]/).pop() || modsDirectory}</span>
        .
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
          disabled={!selectedVersion}
          onClick={async () => {
            if (selectedVersion && modInfo) {
              addModToInstallation({
                emitevent: `mod-download-${modid}-${pathHash}`,
                modsDirectory,
                mod: modInfo,
                version: selectedVersion.modversion,
              });
            }
          }}
        >
          Add Mod
        </Button>
      </DialogFooter>
    </>
  );
}
