import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";

import type { OutputMod } from "@/components/pages/mods-browser";
import { Button } from "@/components/ui/button";
import { useAddModUpdateToInstallation } from "@/hooks/use-add-mod-update-to-installation";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { hashPath } from "@/lib/utils";

export const UpdateAllButton = ({
  modsDirectory,
  updates,
  installedMods,
}: {
  modsDirectory: string;
  updates: ModUpdatesResponse;
  installedMods: OutputMod[];
}) => {
  const pathHash = hashPath(modsDirectory);
  const emitevent = `mod-updates-${pathHash}-progress`;
  const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;
  const queryClient = useQueryClient();
  const [wantsToUpdate, setWantsToUpdate] = useState(false);

  const { mutateAsync: removeModFromInstallation, isPending: removePending } = useMutation({
    mutationFn: (variables: {
      path: string;
      modpath: string;
      updateMod: ModUpdate & { modid: string };
    }) =>
      invoke("remove_mod_from_installation", {
        params: { modpath: variables.modpath, path: variables.path },
      }),
    onError: (error, variables) => {
      toast.error(
        `Error removing ${variables.updateMod.filename} from ${label}: ${error.message}`,
        {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        },
      );
    },
    onSuccess: async (_d, v) => {
      if (modsDirectory) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) }),
          queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) }),
        ]);
        await addModToInstallation({
          emitevent,
          modsDirectory,
          mod: v.updateMod,
        });
      }
    },
  });

  const { mutateAsync: addModToInstallation, isPending } = useAddModUpdateToInstallation({
    onError: (error, variables) => {
      toast.error(`Error updating mod in ${label}: ${error.message}`, {
        id: `mod-update-${pathHash}-${variables.mod.modidstr}`,
      });
    },
  });

  const handleUpdateAll = async () => {
    if (wantsToUpdate) {
      // Trigger update process for all installed mods with updates
      toast.loading("Downloading mod updates...", {
        id: `mod-updates-${pathHash}`,
      });
      // Build a lookup Map to avoid O(n*m) find() inside the loop
      const installedModsByModId = new Map<string | number, (typeof installedMods)[number]>();
      for (const m of installedMods ?? []) {
        installedModsByModId.set(m.modid, m);
        installedModsByModId.set(m.modid.toString(), m);
      }
      await Promise.all([
        ...Object.entries(updates.updates).map(async ([modid, updateMod]) => {
          const isInstalled =
            installedModsByModId.get(Number(modid)) ?? installedModsByModId.get(updateMod.modidstr);
          if (!isInstalled) return;
          toast.loading(`Updating ${isInstalled.name}...`, {
            id: `mod-updates-${pathHash}`,
          });
          await removeModFromInstallation({
            modpath: isInstalled.path,
            path: modsDirectory,
            updateMod: {
              ...updateMod,
              modid: modid,
            },
          });
        }),
        queryClient.invalidateQueries({
          queryKey: installedModsQueryKey(modsDirectory),
        }),
        queryClient.invalidateQueries({
          queryKey: modUpdatesQueryKey(modsDirectory),
        }),
      ]);
      toast.success(`All mod updates completed for ${label}.`, {
        id: `mod-updates-${pathHash}`,
      });
      // Reset the wantsToUpdate state
      setWantsToUpdate(false);
    } else {
      setWantsToUpdate(true);
    }
  };

  return (
    <Button
      disabled={!updates || Object.keys(updates.updates).length === 0 || isPending || removePending}
      onClick={() => updates && handleUpdateAll()}
      variant={wantsToUpdate ? "destructive" : "outline"}
      size="lg"
    >
      {wantsToUpdate ? "Yes, really" : "Update All"}
    </Button>
  );
};
