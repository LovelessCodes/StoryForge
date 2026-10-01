import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { addSeconds, formatDistance, formatDistanceToNow } from "date-fns";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/notify";
import type { World } from "@/lib/types";

interface DeleteWorldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  world: World;
}

/** Stable epoch used only to format a duration via formatDistance. */
const EPOCH = new Date(0);

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}

export default function DeleteWorldSheet({ open, onOpenChange, world }: DeleteWorldSheetProps) {
  const confirmId = useId();
  const [sure, setSure] = useState(false);
  const queryClient = useQueryClient();

  const data = world.data;
  const toastId = `world-delete-${data.world_name}`;

  // Reset the confirmation whenever the sheet opens. Adjusted during render
  // (not in an effect) so the sheet never flashes a stale checkbox.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSure(false);
  }

  const remove = useMutation({
    mutationFn: () => invoke("remove_world", { worldPath: world.path }),
    onMutate: () => {
      toast.loading(`Deleting world ${data.world_name}…`, { id: toastId });
    },
    onError: (error) => {
      toast.error(`Failed to delete world ${data.world_name}`, {
        description: error.message,
        id: toastId,
      });
    },
    onSuccess: () => {
      toast.success(`World ${data.world_name} deleted`, { id: toastId });
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={(next) => !remove.isPending && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            Delete <span className="text-destructive">{data.world_name}</span>?
          </SheetTitle>
          <SheetDescription>
            This cannot be undone. The world save and its map database are permanently removed from
            Story Forge.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="border-warning/40 bg-warning/10 grid gap-3 border p-3 text-[11px]">
              <p className="text-[var(--color-warning)]">
                <b>Warning:</b> This deletes the world from your computer. If you want to keep a
                backup, export it before proceeding.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <Fact label="World name" value={data.world_name} />
                <Fact label="Map identifier" value={data.savegame_identifier} />
                <Fact label="World type" value={data.world_type} />
                <Fact label="Play style" value={data.play_style} />
                <Fact label="Created by" value={data.created_by_player_name} />
                <Fact
                  label="Last played"
                  value={
                    data.last_played
                      ? formatDistanceToNow(new Date(data.last_played), { addSuffix: true })
                      : "Never"
                  }
                />
                <Fact
                  label="Last session"
                  value={formatDistance(EPOCH, addSeconds(EPOCH, data.total_seconds_played))}
                />
                <Fact label="Seed" value={data.seed} />
                <Fact label="Created in version" value={data.created_game_version} />
                <Fact label="Last saved in version" value={data.last_saved_game_version ?? "—"} />
              </dl>
            </div>

            <label className="flex items-center gap-2 text-xs" htmlFor={confirmId}>
              <Switch
                checked={sure}
                id={confirmId}
                onCheckedChange={setSure}
                size="sm"
                aria-label="Confirm world deletion"
              />
              I understand that this action cannot be undone.
            </label>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || !sure}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
