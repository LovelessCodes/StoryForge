import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAddModToInstallation } from "@/hooks/use-add-mod-to-installation";
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import type { ModInfo, ProgressPayload } from "@/lib/types";
import { buildInstallationPath, makeStringFolderSafe } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

const installationSchema = z.object({
  mods: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
    }),
  ),
  name: z.string().min(2).max(100),
  version: z.string().min(2).max(100),
});

export function ImportInstallationDialog({ open }: { open: boolean }) {
  const [newInstallation, setNewInstallation] = useState<string>("");
  const { addInstallation, installations } = useInstallations();
  const { closeDialog } = useDialogStore();
  const listenRef = useRef<() => void>(null);
  const queryClient = useQueryClient();
  const { installationsParent, installationsSubdir } = useSettingsStore();
  const { appFolder } = useAppFolder();

  const { mutate: addModToInstallation, isPending } = useAddModToInstallation({
    onError: (error, variables) => {
      toast.error(
        `Error adding ${variables.mod.mod.name} to ${variables.installation.name}: ${error.message}`,
        {
          id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
        },
      );
      listenRef.current?.();
    },
    onMutate: async (variables) => {
      toast.loading(`Adding ${variables.mod.mod.name} to ${variables.installation.name}...`, {
        id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
      });
      listenRef.current = await listen<ProgressPayload>(variables.emitevent, (event) => {
        const { phase, percent } = event.payload;
        if (phase === "download") {
          toast.loading(
            `Downloading ${variables.mod.mod.name} to ${variables.installation.name}... ${percent?.toFixed(0)}%`,
            {
              id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
            },
          );
        }
      });
    },
    onSuccess: async (_, variables) => {
      listenRef.current?.();
      toast.success(
        `Successfully added ${variables.mod.mod.name} to ${variables.installation.name}`,
        {
          id: `add-mod-${variables.mod.mod.modid}-${variables.installation.id}`,
        },
      );
      await queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(variables.installation.path),
      });
      await queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(variables.installation.id),
      });
      closeDialog();
    },
  });

  const { mutateAsync: initializeGame, isPending: initializePending } = useMutation({
    mutationFn: (path: string) => invoke("initialize_game", { path }) as Promise<string>,
    onError: (error, path) => {
      toast.error(`Error initializing game: ${error}`, {
        id: `initialize-game-${path}`,
      });
    },
    onMutate: (path) => {
      toast.loading(`Initializing game...`, {
        id: `initialize-game-${path}`,
      });
    },
    onSuccess: async (_, path) => {
      toast.success(`Game initialized`, {
        id: `initialize-game-${path}`,
      });

      const installation = installationSchema.safeParse(
        JSON.parse(newInstallation.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")),
      );
      if (installation.success) {
        const installationId = Date.now();
        const newInstallation = {
          favorite: false,
          icon: "",
          id: installationId,
          index: installations.length,
          lastTimePlayed: 0,
          name: installation.data.name,
          path,
          startParams: "",
          totalTimePlayed: 0,
          version: installation.data.version,
        };
        addInstallation(newInstallation);

        for (const mod of installation.data.mods) {
          const modInfo = (await invoke("fetch_mod_info", {
            modid: mod.id,
          })) as ModInfo | null;
          if (modInfo) {
            addModToInstallation({
              emitevent: `import-installation-${installationId}-${mod.id}`,
              installation: newInstallation,
              mod: modInfo,
              version: mod.version,
            });
          }
        }
      }
    },
  });

  const handleImportInstallation = async () => {
    const installation = installationSchema.safeParse(
      JSON.parse(newInstallation.replace(/[""]/g, '"').replace(/['']/g, "'")),
    );
    if (installation.success && appFolder) {
      await initializeGame(
        buildInstallationPath(
          installationsParent ?? appFolder,
          makeStringFolderSafe(installation.data.name),
          installationsSubdir,
        ),
      );
    }
  };

  return (
    <Dialog onOpenChange={() => !isPending && !initializePending && closeDialog()} open={open}>
      <DialogClose />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a new installation</DialogTitle>
          <DialogDescription>
            Enter the JSON configuration of the installation you want to import.
          </DialogDescription>
        </DialogHeader>
        <textarea
          className="h-48 w-full resize-none rounded border p-2"
          onChange={(e) => setNewInstallation(e.target.value)}
          placeholder="Paste installation JSON here..."
          value={newInstallation}
        />
        <DialogFooter>
          <Button
            disabled={isPending || newInstallation.trim() === ""}
            onClick={() => handleImportInstallation()}
          >
            {isPending ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
