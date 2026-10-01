import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { toast } from "@/lib/notify";

/** Confirmation sheet for removing a single mod from a profile / hosted server. */
export function RemoveModSheet({
  destinationLabel,
  modpath,
  modsDirectory,
  name,
  onOpenChange,
  open,
}: {
  name: string;
  modpath: string;
  modsDirectory: string;
  destinationLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const toastId = `mod-remove-${modsDirectory}-${modpath}`;

  const { mutate: removeMod, isPending } = useMutation({
    mutationFn: () =>
      invoke("remove_mod_from_profile", {
        params: { modpath, path: modsDirectory },
      }),
    onError: (error) => {
      toast.error(`Error removing ${name} from ${destinationLabel}: ${error.message}`, {
        id: toastId,
      });
    },
    onMutate: () => {
      toast.loading(`Removing ${name} from ${destinationLabel}...`, { id: toastId });
    },
    onSuccess: (data) => {
      if (data === "removed") {
        toast.success(`Removed ${name} from ${destinationLabel}`, { id: toastId });
        void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
        void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
        onOpenChange(false);
      }
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            Remove <span className="text-accent-amber">{name}</span> from{" "}
            <span className="text-accent-primary">{destinationLabel}</span>?
          </SheetTitle>
          <SheetDescription>This action cannot be undone.</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            <p className="text-muted-foreground text-xs">
              This will permanently remove <span className="text-foreground">{name}</span> from{" "}
              {destinationLabel}.
            </p>
            <p className="text-muted-foreground font-mono text-[11px] break-all">{modpath}</p>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button variant="outline" disabled={isPending} />}>
              Cancel
            </SheetClose>
            <Button variant="destructive" disabled={isPending} onClick={() => removeMod()}>
              Remove
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
