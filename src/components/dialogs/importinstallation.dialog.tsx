import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  DialogClose,
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
import { rootDialogHandle } from "@/routes/__root";
import { useInstallations } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

async function saveInstallationToDisk(installation: {
  name: string;
  path: string;
  version: string;
  startParams: string;
  favorite: boolean;
}) {
  await invoke("save_installation", {
    favorite: installation.favorite,
    name: installation.name,
    path: installation.path,
    startParams: installation.startParams,
    version: installation.version,
  });
}

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

export function ImportInstallationDialog() {
  const [newInstallation, setNewInstallation] = useState<string>("");
  const { addInstallation, installations, loadInstallations } = useInstallations();
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
      rootDialogHandle.close();
    },
  });

  const { mutateAsync: initializeGame } = useMutation({
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
          sizeBytes: 0,
          sizeDisplay: "...",
          startParams: "",
          totalTimePlayed: 0,
          version: installation.data.version,
        };
        addInstallation(newInstallation);
        await saveInstallationToDisk({
          favorite: false,
          name: installation.data.name,
          path,
          startParams: "",
          version: installation.data.version,
        });
        await loadInstallations();

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
    <>
      <DialogClose />
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
    </>
  );
}
