import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { addSeconds, formatDistance, formatDistanceToNow } from "date-fns";
import * as m from "motion/react-m";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { rootAlertDialogHandle } from "@/handles";
import type { World } from "@/lib/types";

export type DeleteWorldDialogProps = {
  world: World;
};

export function DeleteWorldDialog({ world }: DeleteWorldDialogProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const { mutate: removeWorld, isPending } = useMutation({
    mutationFn: (world: World) => invoke("remove_world", { worldPath: world.path }),
    onError: (error) => {
      toast.error(`Failed to delete world ${world.data.world_name}: ${error}`, {
        id: `world-delete-${world.data.world_name}`,
      });
    },
    onMutate: () => {
      toast.loading(`Deleting world ${world.data.world_name}...`, {
        id: `world-delete-${world.data.world_name}`,
      });
    },
    onSuccess: async () => {
      toast.success(`World ${world.data.world_name} deleted`, {
        id: `world-delete-${world.data.world_name}`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["saves"],
      });
      rootAlertDialogHandle.close();
    },
  });

  const [sure, setSure] = useState(false);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Are you sure you want to delete the world{" "}
          <span className="text-destructive">{world.data.world_name}</span>?
        </AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete world{" "}
          <span className="text-destructive">{world.data.world_name}</span> from Story Forge.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="border-warning bg-warning/10 text-warning-foreground my-4 flex flex-col border p-3"
        exit={{ opacity: 0, y: -10 }}
        initial={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <p className="mb-4">
          <b>Warning:</b> This will delete the world from your computer. If you want to keep a
          backup, make sure to export it before proceeding.
        </p>
        <p>
          <b>World info:</b>
        </p>
        <ul className="list-disc pl-5">
          <li>
            World name: <b>{world.data.world_name}</b>
          </li>
          <li>
            Map identifier: <b>{world.data.savegame_identifier}</b>
          </li>
          <li>
            World type: <b>{world.data.world_type}</b>
          </li>
          <li>
            Play style: <b>{world.data.play_style}</b>
          </li>
          <li>
            Created by: <b>{world.data.created_by_player_name}</b>
          </li>
          <li>
            Last played:{" "}
            <b>
              {world.data.last_played
                ? formatDistanceToNow(new Date(world.data.last_played), {
                    addSuffix: true,
                  })
                : "Never"}
            </b>
          </li>
          <li>
            Last session:{" "}
            <b suppressHydrationWarning>
              {formatDistance(new Date(), addSeconds(new Date(), world.data.total_seconds_played))}
            </b>
          </li>
          <li>
            Seed: <b>{world.data.seed}</b>
          </li>
          <li>
            Created in version: <b>{world.data.created_game_version}</b>
          </li>
          <li>
            Last saved in version: <b>{world.data.last_saved_game_version}</b>
          </li>
        </ul>
      </m.div>
      {/* Add a checkbox asking if they're absolutely sure */}
      <div className="flex items-center">
        <Checkbox
          checked={sure}
          className="mr-2"
          id={`confirm-delete-${id}`}
          onCheckedChange={(v) => setSure(!!v)}
        />
        <label className="text-sm" htmlFor={`confirm-delete-${id}`}>
          I understand that this action cannot be undone.
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogClose disabled={isPending} render={<Button variant="outline" />}>
          Cancel
        </AlertDialogClose>
        <Button disabled={isPending || !sure} onClick={() => removeWorld(world)}>
          {isPending ? "Deleting..." : "Delete"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
