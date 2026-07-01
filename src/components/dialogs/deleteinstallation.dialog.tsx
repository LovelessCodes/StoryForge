import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { MapIcon, MapPinXIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { toast } from "sonner";

import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { rootAlertDialogHandle } from "@/handles";
import { useSavesFromInstallation } from "@/hooks/use-saves";
import { type Installation, useInstallations } from "@/stores/installations";
import { useServerStore } from "@/stores/servers";

export type DeleteInstallationDialogProps = {
  installation: Installation;
};

export function DeleteInstallationDialog({ installation }: DeleteInstallationDialogProps) {
  const queryClient = useQueryClient();
  const { removeInstallation } = useInstallations();
  const { servers } = useServerStore();
  const { data: saves } = useSavesFromInstallation(installation.id);

  const activeServers = servers.filter((srv) => srv.installationId === installation.id);

  const canDelete = activeServers.length === 0;

  const { mutate: deleteInstallation, isPending } = useMutation({
    mutationFn: async (id: number) => {
      const result = await invoke<string>("remove_installation", { id });
      return result;
    },
    onError: (error, variables) => {
      toast.error(`Error deleting installation: ${error}`, {
        id: `installation-delete-${variables}`,
      });
    },
    onMutate: (variables) => {
      toast.loading("Deleting installation...", {
        id: `installation-delete-${variables}`,
      });
    },
    onSuccess: async (data, variables) => {
      if (data === "removed") {
        void queryClient.invalidateQueries({ queryKey: ["saves"] });
        void queryClient.invalidateQueries({ queryKey: ["saves", installation.id] });
        removeInstallation(variables);
        toast.success("Installation deleted", {
          id: `installation-delete-${variables}`,
        });
        rootAlertDialogHandle.close();
      }
    },
  });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure you want to delete this installation?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete the installation from your
          computer as well as all its data.
        </AlertDialogDescription>

        {/* Warning for active servers */}
        {activeServers.length > 0 && (
          <m.div
            animate={{ opacity: 1, y: 0 }}
            className="border-destructive bg-destructive/10 text-destructive mb-4 border p-3"
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <strong>Warning:</strong>
            <br />
            The following servers are using this installation and must be removed first:
            <ul className="mt-2 space-y-1">
              <AnimatePresence>
                {activeServers.map((srv) => (
                  <m.li
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 border pl-2"
                    exit={{ opacity: 0, x: 20 }}
                    initial={{ opacity: 0, x: -20 }}
                    key={srv.id}
                    transition={{ duration: 0.2 }}
                  >
                    <MapPinXIcon className="mr-1 inline size-4" />
                    {srv.name || `Server #${srv.id}`}
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          </m.div>
        )}

        {/* List saves if present */}
        {Array.isArray(saves) && saves.length > 0 && (
          <m.div
            animate={{ opacity: 1, y: 0 }}
            className="border-warning bg-warning/10 text-warning-foreground mb-4 border p-3"
            exit={{ opacity: 0, y: 10 }}
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <strong>Saves:</strong>
            <br />
            The following saves will be deleted:
            <ul className="mt-2 space-y-1">
              <AnimatePresence>
                {saves.map((save) => (
                  <m.li
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 border pl-2"
                    exit={{ opacity: 0, x: -20 }}
                    initial={{ opacity: 0, x: 20 }}
                    key={save}
                    transition={{ duration: 0.2 }}
                  >
                    <MapIcon className="mr-1 inline size-4" />
                    {save}
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          </m.div>
        )}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogClose disabled={isPending} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button
          disabled={!canDelete || isPending}
          onClick={() => deleteInstallation(installation.id)}
        >
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
