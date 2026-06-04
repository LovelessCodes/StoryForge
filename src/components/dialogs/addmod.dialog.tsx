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
import type { Installation } from "@/stores/installations";

export type AddModDialogProps = {
  modid: number;
  installation: Installation;
};

export function AddModDialog({ modid, installation }: AddModDialogProps) {
  const { data: modInfo } = useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid: modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const listenRef = useRef<UnlistenFn>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion =
    userSelectedVersion ??
    modInfo?.mod.releases.find((r) => r.tags.includes(installation.version)) ??
    null;
  const queryClient = useQueryClient();
  const { mutate: addModToInstallation } = useAddModToInstallation({
    onError: (error, variables) => {
      toast.error(
        `Error adding ${variables.mod.mod.name} to ${variables.installation.name}: ${error.message}`,
        {
          id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
        },
      );
      listenRef.current?.();
    },
    onMutate: async (variables) => {
      toast.loading(`Adding ${variables.mod.mod.name} to ${variables.installation.name}...`, {
        id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
      });
      listenRef.current = await listen<ProgressPayload>(variables.emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${variables.mod.mod.name} to ${variables.installation.name}... ${percent?.toFixed(0)}%`,
            {
              id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
            },
          );
        }
      });
    },
    onSuccess: async (_, variables) => {
      listenRef.current?.();
      toast.success(
        `Successfully added ${variables.mod.mod.name} to ${variables.installation.name}`,
        {
          id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
        },
      );
      await queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(variables.installation.path),
      });
      await queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(variables.installation.id),
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
          <span className="text-blue-200">{installation.name}</span>
        </h3>
      </DialogHeader>
      <DialogDescription>
        Select the version of <span className="text-warning-foreground">{modInfo?.mod.name}</span>{" "}
        you want to add to <span className="text-blue-200">{installation.name}</span>.
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
                emitevent: `mod-download-${modid}-${installation.id}`,
                installation: installation,
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
