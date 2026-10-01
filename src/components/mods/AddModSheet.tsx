import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

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
import { hashPath, latestRelease } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, ProgressPayload, Release } from "@/lib/types";

import { ModVersionPicker } from "./ModVersionPicker";

/** Release picker shown before adding a mod to a profile / hosted server. */
export function AddModSheet({
  destinationLabel,
  mod,
  modsDirectory,
  onOpenChange,
  open,
}: {
  mod: Mod;
  modsDirectory: string;
  destinationLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: modInfo } = useQuery({
    enabled: open,
    queryFn: () => invoke("fetch_mod_info", { modid: mod.modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", mod.modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const listenRef = useRef<UnlistenFn>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;
  const pathHash = hashPath(modsDirectory);

  useEffect(
    () => () => {
      listenRef.current?.();
      listenRef.current = null;
    },
    [],
  );

  const { mutate: addModToProfile, isPending } = useAddModToProfile({
    onError: (error, variables) => {
      toast.error(
        `Error adding ${variables.mod.mod.name} to ${destinationLabel}: ${error.message}`,
        { id: `add-mod-${variables.mod.mod.modid}-${pathHash}` },
      );
      listenRef.current?.();
      listenRef.current = null;
    },
    onMutate: async (variables) => {
      toast.loading(`Adding ${variables.mod.mod.name} to ${destinationLabel}...`, {
        id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
      });
      listenRef.current = await listen<ProgressPayload>(variables.emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${variables.mod.mod.name} to ${destinationLabel}... ${percent?.toFixed(0)}%`,
            { id: `add-mod-${variables.mod.mod.modid}-${pathHash}` },
          );
        }
      });
    },
    onSuccess: (_, variables) => {
      listenRef.current?.();
      listenRef.current = null;
      toast.success(`Successfully added ${variables.mod.mod.name} to ${destinationLabel}`, {
        id: `add-mod-${variables.mod.mod.modid}-${pathHash}`,
      });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            Add <span className="text-accent-amber">{modInfo?.mod.name ?? mod.name}</span> to{" "}
            <span className="text-accent-primary">{destinationLabel}</span>
          </SheetTitle>
          <SheetDescription>
            Select the version of {modInfo?.mod.name ?? mod.name} you want to add to{" "}
            {destinationLabel}.
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
            disabled={!selectedVersion || isPending}
            onClick={() => {
              if (selectedVersion && modInfo) {
                addModToProfile({
                  emitevent: `mod-download-${mod.modid}-${pathHash}`,
                  modsDirectory,
                  mod: modInfo,
                  version: selectedVersion.modversion,
                });
              }
            }}
          >
            Add Mod
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
