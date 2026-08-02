import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { Mod } from "@/components/lists/mod.list";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { rootDialogHandle } from "@/handles";
import { useHostedServers } from "@/hooks/queries/server-hosting";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload, Release } from "@/lib/types";
import { hashPath, latestRelease, pathDelimiter } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export type StandaloneInstallPickerProps = {
  modid: number;
  mod: Mod;
};

type Destination = {
  id: string;
  name: string;
  path: string;
  type: "installation" | "hosted-server";
};

export function StandaloneInstallPickerDialog({ modid, mod }: StandaloneInstallPickerProps) {
  const { installations } = useInstallations();
  const { data: hostedInstances } = useHostedServers();
  const { data: modInfo } = useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid: modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const destinations: Destination[] = [
    ...installations.map((inst) => ({
      id: `inst-${inst.id}`,
      name: inst.name,
      path: `${inst.path}${pathDelimiter}Mods`,
      type: "installation" as const,
    })),
    ...(hostedInstances ?? []).map((si) => ({
      id: `hosted-${si.id}`,
      name: si.name,
      path: `${si.data_dir}${pathDelimiter}Mods`,
      type: "hosted-server" as const,
    })),
  ];

  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;

  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);

  const { mutate: installMod, isPending } = useMutation({
    mutationFn: async ({ dest, release }: { dest: Destination; release: Release }) => {
      const pathHash = hashPath(dest.path);
      const emitevent = `mod-download-${modid}-${pathHash}`;
      return invoke("download_and_maybe_extract", {
        destpath: dest.path,
        emitevent,
        extract: false,
        url: release.mainfile,
      }) as Promise<string>;
    },
    onError: (error, variables) => {
      toast.error(
        `Error installing ${modInfo?.mod.name ?? mod.name} to ${variables.dest.name}: ${error.message}`,
        { id: `standalone-install-${modid}-${variables.dest.id}` },
      );
      listenRef.current?.();
    },
    onMutate: async (variables) => {
      const label = modInfo?.mod.name ?? mod.name;
      const pathHash = hashPath(variables.dest.path);
      const emitevent = `mod-download-${modid}-${pathHash}`;
      toast.loading(`Installing ${label} to ${variables.dest.name}...`, {
        id: `standalone-install-${modid}-${variables.dest.id}`,
      });
      listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${label} to ${variables.dest.name}... ${percent?.toFixed(0)}%`,
            { id: `standalone-install-${modid}-${variables.dest.id}` },
          );
        }
      });
    },
    onSuccess: async (_, variables) => {
      listenRef.current?.();
      toast.success(`Installed ${modInfo?.mod.name ?? mod.name} to ${variables.dest.name}`, {
        id: `standalone-install-${modid}-${variables.dest.id}`,
      });
      // Invalidate queries for the destination path
      const destDir = variables.dest.path.endsWith(`${pathDelimiter}Mods`)
        ? variables.dest.path.slice(0, -`${pathDelimiter}Mods`.length)
        : variables.dest.path;
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(destDir) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(destDir) });
      rootDialogHandle.close();
    },
  });

  const handleInstall = () => {
    if (!selectedDestination || !selectedVersion || !modInfo) return;
    installMod({ dest: selectedDestination, release: selectedVersion });
  };

  const installationDests = destinations.filter((d) => d.type === "installation");
  const hostedDests = destinations.filter((d) => d.type === "hosted-server");

  return (
    <>
      <DialogClose />
      <DialogHeader>
        <h3 className="text-lg leading-6 font-medium">
          Install <span className="text-warning-foreground">{modInfo?.mod.name ?? mod.name}</span>
        </h3>
      </DialogHeader>
      <DialogDescription>
        Choose where to install this mod and which version to use.
      </DialogDescription>

      <div className="mt-2 flex flex-col gap-4">
        {/* Destination picker */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Destination</label>
          <Select
            onValueChange={(value) => {
              const dest = destinations.find((d) => d.id === value);
              setSelectedDestination(dest ?? null);
            }}
            value={selectedDestination?.id ?? undefined}
          >
            <SelectTrigger className="w-full truncate">
              <span>{selectedDestination?.name ?? "Select destination..."}</span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {installationDests.length > 0 && (
                <>
                  <div className="text-muted-foreground px-2 py-1 text-xs font-semibold">
                    Installations
                  </div>
                  {installationDests.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </>
              )}
              {hostedDests.length > 0 && (
                <>
                  <div className="text-muted-foreground px-2 py-1 text-xs font-semibold">
                    Hosted Servers
                  </div>
                  {hostedDests.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </>
              )}
              {destinations.length === 0 && (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  No installations or hosted servers available.
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Version picker */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">Version</label>
          <Select
            onValueChange={(value) => {
              const release = modInfo?.mod.releases.find((r) => r.modversion === value) || null;
              setUserSelectedVersion(release);
            }}
            value={selectedVersion?.modversion ?? undefined}
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
      </div>

      <DialogFooter>
        <Button
          disabled={!selectedDestination || !selectedVersion || isPending}
          onClick={handleInstall}
        >
          Install
        </Button>
      </DialogFooter>
    </>
  );
}
