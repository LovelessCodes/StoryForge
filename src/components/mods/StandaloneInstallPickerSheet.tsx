import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHostedServers } from "@/hooks/queries/server-hosting";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { hashPath, latestRelease, pathDelimiter } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, ProgressPayload, Release } from "@/lib/types";
import { useProfiles } from "@/stores/profiles";

import { ModVersionPicker } from "./ModVersionPicker";

type Destination = {
  id: string;
  name: string;
  path: string;
  type: "profile" | "hosted-server";
};

/** Standalone install flow (no active profile): pick a destination + release. */
export function StandaloneInstallPickerSheet({
  mod,
  onOpenChange,
  open,
}: {
  mod: Mod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profiles } = useProfiles();
  const { data: hostedInstances } = useHostedServers();
  const { data: modInfo } = useQuery({
    enabled: open,
    queryFn: () => invoke("fetch_mod_info", { modid: mod.modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", mod.modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const destinations = useMemo<Destination[]>(
    () => [
      ...profiles.map((profile) => ({
        id: `profile-${profile.id}`,
        name: profile.name,
        path: `${profile.path}${pathDelimiter}Mods`,
        type: "profile" as const,
      })),
      ...(hostedInstances ?? []).map((instance) => ({
        id: `hosted-${instance.id}`,
        name: instance.name,
        path: `${instance.data_dir}${pathDelimiter}Mods`,
        type: "hosted-server" as const,
      })),
    ],
    [profiles, hostedInstances],
  );

  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;
  const queryClient = useQueryClient();
  const listenRef = useRef<UnlistenFn>(null);

  useEffect(
    () => () => {
      listenRef.current?.();
      listenRef.current = null;
    },
    [],
  );

  const { mutate: installMod, isPending } = useMutation({
    mutationFn: ({ dest, release }: { dest: Destination; release: Release }) => {
      const emitevent = `mod-download-${mod.modid}-${hashPath(dest.path)}`;
      return invoke("download_and_maybe_extract", {
        params: {
          destpath: dest.path,
          emitevent,
          extract: false,
          url: release.mainfile,
        },
      }) as Promise<string>;
    },
    onError: (error, variables) => {
      toast.error(
        `Error installing ${modInfo?.mod.name ?? mod.name} to ${variables.dest.name}: ${error.message}`,
        { id: `standalone-install-${mod.modid}-${variables.dest.id}` },
      );
      listenRef.current?.();
      listenRef.current = null;
    },
    onMutate: async (variables) => {
      const label = modInfo?.mod.name ?? mod.name;
      const emitevent = `mod-download-${mod.modid}-${hashPath(variables.dest.path)}`;
      toast.loading(`Installing ${label} to ${variables.dest.name}...`, {
        id: `standalone-install-${mod.modid}-${variables.dest.id}`,
      });
      listenRef.current = await listen<ProgressPayload>(emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${label} to ${variables.dest.name}... ${percent?.toFixed(0)}%`,
            { id: `standalone-install-${mod.modid}-${variables.dest.id}` },
          );
        }
      });
    },
    onSuccess: (_, variables) => {
      listenRef.current?.();
      listenRef.current = null;
      toast.success(`Installed ${modInfo?.mod.name ?? mod.name} to ${variables.dest.name}`, {
        id: `standalone-install-${mod.modid}-${variables.dest.id}`,
      });
      const modsSuffix = `${pathDelimiter}Mods`;
      const destDir = variables.dest.path.endsWith(modsSuffix)
        ? variables.dest.path.slice(0, -modsSuffix.length)
        : variables.dest.path;
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(destDir) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(destDir) });
      onOpenChange(false);
    },
  });

  const destinationProfiles = destinations.filter((d) => d.type === "profile");
  const destinationHosted = destinations.filter((d) => d.type === "hosted-server");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            Install <span className="text-accent-amber">{modInfo?.mod.name ?? mod.name}</span>
          </SheetTitle>
          <SheetDescription>
            No active profile. Choose where to install this mod and which version to use.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                Destination
              </p>
              <Select
                onValueChange={(value) => {
                  const dest = destinations.find((d) => d.id === value);
                  setSelectedDestination(dest ?? null);
                }}
                value={selectedDestination?.id ?? null}
              >
                <SelectTrigger className="w-full" aria-label="Install destination">
                  <span className="truncate">
                    {selectedDestination?.name ?? "Select destination..."}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {destinationProfiles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Profiles</SelectLabel>
                      {destinationProfiles.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {destinationHosted.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Hosted Servers</SelectLabel>
                      {destinationHosted.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {destinations.length === 0 && (
                    <div className="text-muted-foreground px-2 py-3 text-xs">
                      No profiles or hosted servers available.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                Version
              </p>
              <ModVersionPicker
                onSelect={setUserSelectedVersion}
                releases={modInfo?.mod.releases}
                selected={selectedVersion}
              />
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={!selectedDestination || !selectedVersion || isPending}
            onClick={() => {
              if (selectedDestination && selectedVersion) {
                installMod({ dest: selectedDestination, release: selectedVersion });
              }
            }}
          >
            Install
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
