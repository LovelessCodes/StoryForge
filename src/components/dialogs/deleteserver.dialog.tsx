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
import { useRemoveServerFromInstallation } from "@/hooks/use-remove-server-from-installation";
import { type Server, useServerStore } from "@/stores/servers";

export type DeleteServerDialogProps = {
  server: Server;
};

export function DeleteServerDialog({ server }: DeleteServerDialogProps) {
  const { mutate, isPending } = useRemoveServerFromInstallation({
    onError: (error) => {
      toast.error(`Error removing server: ${error}`, {
        id: `server-remove-${server.id}`,
      });
    },
    onSuccess: async () => {
      await loadServers();
      rootAlertDialogHandle.close();
    },
  });
  const { loadServers } = useServerStore();

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure you want to delete this server?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete the server from Story Forge.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogClose disabled={isPending} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button
          disabled={isPending}
          onClick={() =>
            mutate({
              installationId: server.installationId,
              server: `${server.name},${server.ip}${server.port ? `:${server.port}` : ""},${server.password ? `${server.password}` : ""}`,
            })
          }
        >
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
