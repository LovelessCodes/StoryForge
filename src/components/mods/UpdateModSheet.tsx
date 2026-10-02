import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAddModToProfile } from "@/hooks/use-add-mod-to-profile";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { hashPath } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, OutputMod, Release } from "@/lib/types";

import { ModVersionPicker } from "./ModVersionPicker";

/**
 * Upgrade/downgrade picker for an installed mod: the old file is removed from
 * the profile, then the selected release is downloaded in its place.
 */
export function UpdateModSheet({
  destinationLabel,
  installedMod,
  mod,
  modsDirectory,
  onOpenChange,
  open,
}: {
  mod: Mod;
  installedMod: OutputMod;
  modsDirectory: string;
  destinationLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: modInfo } = useQuery({
    enabled: open,
    queryFn: () => invoke("fetch_mod_info", { modid: mod.modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", mod.modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const versionFrom = installedMod.version;
  const selectedVersion =
    userSelectedVersion ??
    (versionFrom
      ? (modInfo?.mod.releases.find((r) => r.modversion === versionFrom) ?? null)
      : null);
  const pathHash = hashPath(modsDirectory);
  const label = modInfo?.mod.name ?? mod.name;

  const isUpgrade = selectedVersion ? selectedVersion.modversion >= versionFrom : true;
  const wording = {
    Gerund: isUpgrade ? "Upgrading" : "Downgrading",
    button: isUpgrade ? "Update" : "Downgrade",
    gerund: isUpgrade ? "upgrading" : "downgrading",
    past: isUpgrade ? "updated" : "downgraded",
  };

  const { mutate: addModToProfile, isPending: addPending } = useAddModToProfile({
    onError: (error) => {
      if (error.message === "Download cancelled") return;
      toast.error(`Error ${wording.gerund} ${label} to ${destinationLabel}: ${error.message}`, {
        id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
      });
    },
  });

  const { mutate: removeModFromProfile, isPending: removePending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
      invoke("remove_mod_from_profile", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(
        `Error removing ${variables.modpath} from ${destinationLabel}: ${error.message}`,
        {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      if (selectedVersion && modInfo) {
        // Runs in the downloads manager; progress, pausing and cancelling
        // happen in the Downloads sheet.
        addModToProfile({
          destinationLabel,
          modsDirectory,
          mod: modInfo,
          version: selectedVersion.modversion,
        });
      }
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {wording.button} <span className="text-accent-amber">{label}</span> in{" "}
            <span className="text-accent-primary">{destinationLabel}</span>
          </SheetTitle>
          <SheetDescription>
            Currently installed version: <span className="font-mono">{versionFrom}</span>. Select
            the version you want to change to.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
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
            {!modInfo && <p className="text-muted-foreground text-xs">Loading releases...</p>}
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={
              !selectedVersion ||
              addPending ||
              removePending ||
              selectedVersion.modversion === versionFrom
            }
            onClick={() => {
              if (selectedVersion && selectedVersion.modversion !== versionFrom) {
                removeModFromProfile({
                  modpath: installedMod.path,
                  path: modsDirectory,
                });
              }
            }}
          >
            {wording.button} Mod
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
