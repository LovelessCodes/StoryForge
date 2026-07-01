import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
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
import { installedModsQueryKey } from "@/hooks/use-installed-mods";

export type RemoveModDialogProps = {
  name: string;
  path: string;
  modsDirectory: string;
};

export function RemoveModDialog({ name, path, modsDirectory }: RemoveModDialogProps) {
  const queryClient = useQueryClient();
  const label = modsDirectory.split(/[/\\]/).pop() || modsDirectory;
  const { mutate: removeModFromInstallation, isPending } = useMutation({
    mutationFn: ({ path, modpath }: { path: string; modpath: string }) =>
      invoke("remove_mod_from_installation", { params: { modpath, path } }),
    onError: (error, variables) => {
      toast.error(`Error removing ${name} from ${label}: ${error.message}`, {
        id: `mod-remove-${variables.path}-${variables.modpath}`,
      });
    },
    onMutate: (variables) => {
      toast.loading(`Removing ${name} from ${label}...`, {
        id: `mod-remove-${variables.path}-${variables.modpath}`,
      });
    },
    onSuccess: async (data, variables) => {
      if (data === "removed") {
        toast.success(`Removed ${name} from ${label}`, {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        });
        // Invalidate the mods query to refresh the list
        void queryClient.invalidateQueries({
          queryKey: installedModsQueryKey(modsDirectory),
        });
        rootAlertDialogHandle.close();
      }
    },
  });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Are you sure you want to remove <span className="text-warning-foreground">{name}</span>{" "}
          from <span className="text-blue-200">{label}</span>?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently remove{" "}
          <span className="text-warning-foreground">{name}</span> from{" "}
          <span className="text-blue-200">{label}</span>.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogClose disabled={isPending} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button
          disabled={isPending}
          onClick={() =>
            removeModFromInstallation({
              modpath: path,
              path: modsDirectory,
            })
          }
        >
          Remove
        </Button>
      </AlertDialogFooter>
    </>
  );
}
