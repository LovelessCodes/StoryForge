import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { rootDialogHandle } from "@/handles";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { makeStringFolderSafe } from "@/lib/utils";
import { useInstallations, type Installation } from "@/stores/installations";

const installationSchema = z.object({
  mods: z.union([
    z.array(
      z.object({
        id: z.string(),
        version: z.string(),
      }),
    ),
    z.string(),
  ]),
  name: z.string().min(2).max(100),
  version: z.string().min(2).max(100),
  startParams: z.string().optional().default(""),
});

type BackendInstallationResult = {
  id: number;
  name: string;
  version: string;
  startParams: string;
  path: string;
  size_bytes: number;
  size_display: string;
  favorite: boolean;
  modpack_slug: string | null;
  modpack_version: string | null;
};

type ImportProgress = {
  current: number;
  total: number;
  modid: string;
  version: string;
};

export function ImportInstallationDialog() {
  const queryClient = useQueryClient();
  const [newInstallation, setNewInstallation] = useState<string>("");
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const { addInstallation, loadInstallations } = useInstallations();
  const listenRef = useRef<UnlistenFn>(null);

  const { mutate: doImport, isPending } = useMutation({
    mutationFn: async (input: {
      name: string;
      version: string;
      startParams: string;
      mods: string;
      emitevent: string;
    }) => {
      const safeName = makeStringFolderSafe(input.name);
      const result = (await invoke("import_installation", {
        emitevent: input.emitevent,
        mods: input.mods,
        name: input.name,
        safeName,
        startParams: input.startParams,
        version: input.version,
      })) as BackendInstallationResult;
      return result;
    },
    onError: (error: Error) => {
      listenRef.current?.();
      setProgress(null);
      toast.error(`Import failed: ${error.message}`, {
        id: "import-installation",
      });
    },
    onMutate: async (input) => {
      toast.loading(`Importing "${input.name}"...`, {
        id: "import-installation",
      });

      // Start listening for per-mod download progress
      listenRef.current = await listen<{
        phase: string;
        current: number;
        total: number;
        modid: string;
        version: string;
      }>(input.emitevent, (event) => {
        if (event.payload.phase === "downloading") {
          setProgress({
            current: event.payload.current,
            modid: event.payload.modid,
            total: event.payload.total,
            version: event.payload.version,
          });
        }
      });
    },
    onSuccess: async (result) => {
      listenRef.current?.();
      setProgress(null);

      const installation: Installation = {
        favorite: false,
        icon: "",
        id: result.id,
        index: 0,
        lastTimePlayed: 0,
        name: result.name,
        path: result.path,
        sizeBytes: result.size_bytes,
        sizeDisplay: result.size_display,
        startParams: result.startParams,
        totalTimePlayed: 0,
        version: result.version,
        modpackSlug: result.modpack_slug ?? null,
        modpackVersion: result.modpack_version ?? null,
      };

      addInstallation(installation);
      await loadInstallations();
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });

      toast.success(`Successfully imported "${result.name}"`, {
        id: "import-installation",
      });

      rootDialogHandle.close();
    },
  });

  const handleImportInstallation = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        newInstallation.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"),
      );
    } catch {
      toast.error("Invalid JSON");
      return;
    }

    const result = installationSchema.safeParse(parsed);
    if (!result.success) {
      toast.error("Invalid installation JSON");
      return;
    }

    const { name, version, startParams, mods } = result.data;

    const modsString =
      typeof mods === "string" ? mods : mods.map((m) => `${m.id}@${m.version}`).join(",");

    const emitevent = `import-installation-${Date.now()}`;

    doImport({ emitevent, mods: modsString, name, startParams, version });
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
        aria-label="Installation JSON"
        className="h-48 w-full resize-none rounded border p-2"
        disabled={isPending}
        onChange={(e) => setNewInstallation(e.target.value)}
        placeholder="Paste installation JSON here..."
        value={newInstallation}
      />
      {progress && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">
            Downloading mod {progress.current} of {progress.total}:{" "}
            <span className="text-foreground font-medium">{progress.modid}</span>
            <span className="text-muted-foreground">@{progress.version}</span>
          </p>
          <Progress value={Math.round((progress.current / progress.total) * 100)}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        </div>
      )}
      <DialogFooter>
        <Button
          disabled={isPending || newInstallation.trim() === ""}
          onClick={handleImportInstallation}
        >
          {isPending ? "Importing..." : "Import"}
        </Button>
      </DialogFooter>
    </>
  );
}
