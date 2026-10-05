import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAddModUpdateToProfile } from "@/hooks/use-add-mod-update-to-profile";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { hashPath } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";

/** Two-step "Update All": first click arms, second click runs every update. */
export function UpdateAllButton({
  destinationLabel,
  installedMods,
  modsDirectory,
  updates,
}: {
  modsDirectory: string;
  destinationLabel: string;
  updates: ModUpdatesResponse;
  installedMods: OutputMod[];
}) {
  const { t } = useTranslation();
  const pathHash = hashPath(modsDirectory);
  const queryClient = useQueryClient();
  const [wantsToUpdate, setWantsToUpdate] = useState(false);

  const { mutateAsync: addModUpdate, isPending: addPending } = useAddModUpdateToProfile({
    onError: (error, variables) => {
      if (error.message === "Download cancelled") return;
      toast.error(
        t("mods.errors.updateIn", { destination: destinationLabel, message: error.message }),
        {
          id: `mod-update-${pathHash}-${variables.mod.modidstr}`,
        },
      );
    },
  });

  const { mutateAsync: removeModFromProfile, isPending: removePending } = useMutation({
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

  const updateCount = Object.keys(updates.updates).length;

  const handleUpdateAll = () => {
    if (!wantsToUpdate) {
      setWantsToUpdate(true);
      return;
    }

    // Build a lookup Map to avoid O(n*m) find() inside the loop
    const installedModsByModId = new Map<string | number, OutputMod>();
    for (const installed of installedMods) {
      installedModsByModId.set(installed.modid, installed);
      installedModsByModId.set(installed.modid.toString(), installed);
    }

    void (async () => {
      try {
        await Promise.all(
          Object.entries(updates.updates).map(async ([modid, updateMod]) => {
            const installed =
              installedModsByModId.get(Number(modid)) ??
              installedModsByModId.get(updateMod.modidstr);
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
      } catch {
        // Per-mod failures are already toasted by the mutations.
      } finally {
        setWantsToUpdate(false);
      }
    })();
  };

  return (
    <Button
      variant={wantsToUpdate ? "destructive" : "outline"}
      size="sm"
      disabled={updateCount === 0 || addPending || removePending}
      onClick={handleUpdateAll}
    >
      {addPending || removePending ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />}
      {wantsToUpdate
        ? t("mods.updateAll.confirm")
        : t("mods.updateAll.button", { count: updateCount })}
    </Button>
  );
}
