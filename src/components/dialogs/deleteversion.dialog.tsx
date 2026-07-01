import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
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
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";

export type DeleteVersionDialogProps = {
  version: string;
};

export function DeleteVersionDialog({ version }: DeleteVersionDialogProps) {
  const queryClient = useQueryClient();
  const { mutate: removeVersion, isPending } = useMutation({
    mutationFn: (version: string) => invoke("remove_installed_version", { version }),
    onError: (error) => {
      toast.error(`Failed to delete version ${version}: ${error}`, {
        id: `version-delete-${version}`,
      });
    },
    onMutate: () => {
      toast.loading(`Deleting version ${version}...`, {
        id: `version-delete-${version}`,
      });
    },
    onSuccess: async () => {
      toast.success(`Version ${version} deleted`, {
        id: `version-delete-${version}`,
      });
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
      rootAlertDialogHandle.close();
    },
  });

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure you want to delete version {version}?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete version {version} from Story
          Forge.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="border-warning bg-warning/10 text-warning-foreground my-4 border p-3"
        exit={{ opacity: 0, y: -10 }}
        initial={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <strong>Note:</strong>
        <br />
        Deleting versions that are currently in use by installations will not harm these
        installations or their servers. However, you will not be able to create new installations
        with this version until you reinstall it.
      </m.div>
      <AlertDialogFooter>
        <AlertDialogClose disabled={isPending} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button disabled={isPending} onClick={() => removeVersion(version)}>
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
