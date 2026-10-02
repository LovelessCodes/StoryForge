import { useQuery } from "@tanstack/react-query";
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
import { hashPath, latestRelease } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, Release } from "@/lib/types";

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
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;
  const pathHash = hashPath(modsDirectory);

  const { mutate: addModToProfile, isPending } = useAddModToProfile({
    onError: (error, variables) => {
      if (error.message === "Download cancelled") return;
      toast.error(
        `Error adding ${variables.mod.mod.name} to ${destinationLabel}: ${error.message}`,
        { id: `add-mod-${variables.mod.mod.modid}-${pathHash}` },
      );
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
              if (!selectedVersion || !modInfo) return;
              // Runs in the downloads manager; progress, pausing and
              // cancelling happen in the Downloads sheet.
              addModToProfile({
                destinationLabel,
                modsDirectory,
                mod: modInfo,
                version: selectedVersion.modversion,
              });
              onOpenChange(false);
            }}
          >
            Add Mod
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
