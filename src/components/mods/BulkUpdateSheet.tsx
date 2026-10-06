import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ArrowUpCircle, ClipboardCopy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
import { Skeleton } from "@/components/ui/skeleton";
import { useAddModUpdateToProfile } from "@/hooks/use-add-mod-update-to-profile";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { hashPath } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { ModInfo, OutputMod } from "@/lib/types";

/**
 * Review every pending mod update before running them: the changelogs of each
 * release, a one-click "Update all", and a copy button for sharing a server's
 * changelog list.
 */
export function BulkUpdateSheet({
  destinationLabel,
  installedMods,
  modsDirectory,
  onOpenChange,
  open,
  updates,
}: {
  modsDirectory: string;
  destinationLabel: string;
  installedMods: OutputMod[];
  updates: ModUpdatesResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const pathHash = hashPath(modsDirectory);
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const entries = useMemo(() => Object.values(updates.updates), [updates]);

  const information = useQueries({
    queries: open
      ? entries.map((update) => ({
          queryKey: ["modInfo", update.modidstr],
          queryFn: () =>
            invoke<ModInfo>("fetch_mod_info", { modid: update.modidstr }) as Promise<ModInfo>,
          staleTime: Infinity,
          enabled: open,
        }))
      : [],
  });

  const infoFor = (update: ModUpdate, index: number) => {
    const info = information[index]?.data;
    const release = info?.mod.releases.find((r) => r.modversion === update.modversion);
    const installed = installedMods.find(
      (mod) => mod.modid === update.modidstr || String(mod.modid) === update.modidstr,
    );
    return {
      changelog: release?.changelog,
      loading: information[index]?.isPending ?? false,
      name: info?.mod.name ?? installed?.name ?? update.modidstr,
      installedVersion: installed?.version,
    };
  };

  const { mutateAsync: addModUpdate } = useAddModUpdateToProfile({
    onError: (error, variables) => {
      if (error.message === "Download cancelled") return;
      toast.error(
        t("mods.errors.updateIn", { destination: destinationLabel, message: error.message }),
        { id: `mod-update-${pathHash}-${variables.mod.modidstr}` },
      );
    },
  });

  const { mutateAsync: removeModFromProfile } = useMutation({
    mutationFn: (variables: { path: string; modpath: string; updateMod: ModUpdate }) =>
      invoke("remove_mod_from_profile", {
        params: { modpath: variables.modpath, path: variables.path },
      }),
    onError: (error, variables) => {
      toast.error(
        t("mods.errors.remove", {
          name: variables.updateMod.filename,
          destination: destinationLabel,
          message: error.message,
        }),
        { id: `mod-remove-${variables.path}-${variables.modpath}` },
      );
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: installedModsQueryKey(variables.path) }),
        queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(variables.path) }),
      ]);
    },
  });

  const runUpdates = async () => {
    // Build a lookup Map to avoid O(n*m) find() inside the loop.
    const installedModsByModId = new Map<string | number, OutputMod>();
    for (const installed of installedMods) {
      installedModsByModId.set(installed.modid, installed);
      installedModsByModId.set(installed.modid.toString(), installed);
    }

    setUpdating(true);
    try {
      await Promise.all(
        Object.entries(updates.updates).map(async ([modid, updateMod]) => {
          const installed =
            installedModsByModId.get(Number(modid)) ?? installedModsByModId.get(updateMod.modidstr);
          if (!installed) return;
          await removeModFromProfile({
            modpath: installed.path,
            path: modsDirectory,
            updateMod,
          });
          // Runs in the downloads manager; progress, pausing and cancelling
          // happen in the Downloads sheet.
          await addModUpdate({
            destinationLabel,
            label: `${installed.name} v${updateMod.modversion}`,
            modsDirectory,
            mod: updateMod,
          });
        }),
      );
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
      onOpenChange(false);
    } catch {
      // Per-mod failures are already toasted by the mutations.
    } finally {
      setUpdating(false);
    }
  };

  const copyChangelogs = async () => {
    const text = entries
      .map((update, index) => {
        const info = infoFor(update, index);
        const from = info.installedVersion ? `${info.installedVersion} → ` : "";
        return `${info.name} ${from}${update.modversion}\n${
          info.changelog?.trim() || t("mods.bulk.noChangelog")
        }`;
      })
      .join("\n\n");
    try {
      await writeText(text);
      toast.success(t("mods.bulk.copied"));
    } catch (error) {
      toast.error(t("mods.bulk.copyFailed"), { description: String(error) });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!updating) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{t("mods.bulk.title", { count: entries.length })}</SheetTitle>
          <SheetDescription>{t("mods.bulk.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            {entries.map((update, index) => {
              const info = infoFor(update, index);
              return (
                <div key={update.modidstr} className="grid gap-1 border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{info.name}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {info.installedVersion ? `${info.installedVersion} → ` : ""}
                      {update.modversion}
                    </span>
                  </div>
                  {info.loading ? (
                    <Skeleton className="h-3 w-3/4" />
                  ) : (
                    <p className="text-muted-foreground line-clamp-4 text-[11px] whitespace-pre-wrap">
                      {info.changelog?.trim() || t("mods.bulk.noChangelog")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={updating}
              onClick={() => void copyChangelogs()}
            >
              <ClipboardCopy /> {t("mods.bulk.copy")}
            </Button>
            <Button
              variant="accent-primary"
              size="sm"
              disabled={updating || entries.length === 0}
              onClick={() => void runUpdates()}
            >
              {updating ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />}
              {t("mods.bulk.updateAll", { count: entries.length })}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
