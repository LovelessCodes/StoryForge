import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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

  const { mutate: addModToProfile, isPending: addPending } = useAddModToProfile({
    onError: (error) => {
      if (error.message === "Download cancelled") return;
      toast.error(
        t(isUpgrade ? "mods.errors.upgrading" : "mods.errors.downgrading", {
          name: label,
          destination: destinationLabel,
          message: error.message,
        }),
        {
          id: `add-mod-${modInfo?.mod.modid}-${pathHash}`,
        },
      );
    },
  });

  const { mutate: removeModFromProfile, isPending: removePending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
      invoke("remove_mod_from_profile", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(
        t("mods.errors.remove", {
          name: variables.modpath,
          destination: destinationLabel,
          message: error.message,
        }),
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
            <Trans
              components={{
                name: <span className="text-accent-amber" />,
                destination: <span className="text-accent-primary" />,
              }}
              i18nKey={
                isUpgrade ? "mods.updateSheet.titleUpdate" : "mods.updateSheet.titleDowngrade"
              }
              values={{ destination: destinationLabel, name: label }}
            />
          </SheetTitle>
          <SheetDescription>
            <Trans
              components={{ version: <span className="font-mono" /> }}
              i18nKey="mods.updateSheet.description"
              values={{ version: versionFrom }}
            />
          </SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("common.fields.version")}
              </p>
              <ModVersionPicker
                onSelect={setUserSelectedVersion}
                releases={modInfo?.mod.releases}
                selected={selectedVersion}
              />
            </div>
            {!modInfo && (
              <p className="text-muted-foreground text-xs">{t("mods.loadingReleases")}</p>
            )}
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
            {isUpgrade ? t("mods.updateSheet.buttonUpdate") : t("mods.updateSheet.buttonDowngrade")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
