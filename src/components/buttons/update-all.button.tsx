import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";

import type { OutputMod } from "@/components/pages/install-mods";
import { Button } from "@/components/ui/button";
import { useAddModUpdateToInstallation } from "@/hooks/use-add-mod-update-to-installation";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import type { Installation } from "@/stores/installations";

export const UpdateAllButton = ({
  installation,
  updates,
  installedMods,
}: {
  installation: Installation;
  updates: ModUpdatesResponse;
  installedMods: OutputMod[];
}) => {
  const emitevent = `mod-updates-${installation?.id}-progress`;
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
        `Error removing ${variables.updateMod.filename} from ${installation.name}: ${error.message}`,
        {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        },
      );
    },
    onSuccess: async (_d, v) => {
      if (installation) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: installedModsQueryKey(installation.path) }),
          queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(installation.id) }),
        ]);
        await addModToInstallation({
          emitevent,
          installation,
          mod: v.updateMod,
        });
      }
    },
  });

  const { mutateAsync: addModToInstallation, isPending } = useAddModUpdateToInstallation({
    onError: (error, variables) => {
      toast.error(`Error updating mod in ${variables.installation.name}: ${error.message}`, {
        id: `mod-update-${variables.installation.id}-${variables.mod.modidstr}`,
      });
    },
  });

  const handleUpdateAll = async () => {
    if (wantsToUpdate) {
      // Trigger update process for all installed mods with updates
      toast.loading("Downloading mod updates...", {
        id: `mod-updates-${installation.id}`,
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
            id: `mod-updates-${installation.id}`,
          });
          await removeModFromInstallation({
            modpath: isInstalled.path,
            path: installation.path,
            updateMod: {
              ...updateMod,
              modid: modid,
            },
          });
        }),
        queryClient.invalidateQueries({
          queryKey: installedModsQueryKey(installation.path),
        }),
        queryClient.invalidateQueries({
          queryKey: modUpdatesQueryKey(installation.id),
        }),
      ]);
      toast.success(`All mod updates completed for ${installation.name}.`, {
        id: `mod-updates-${installation.id}`,
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
