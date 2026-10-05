import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toastId = `mod-remove-${modsDirectory}-${modpath}`;

  const { mutate: removeMod, isPending } = useMutation({
    mutationFn: () =>
      invoke("remove_mod_from_profile", {
        params: { modpath, path: modsDirectory },
      }),
    onError: (error) => {
      toast.error(
        t("mods.errors.remove", {
          name,
          destination: destinationLabel,
          message: error.message,
        }),
        {
          id: toastId,
        },
      );
    },
    onSuccess: (data) => {
      if (data === "removed") {
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
            <Trans
              components={{
                name: <span className="text-accent-amber" />,
                destination: <span className="text-accent-primary" />,
              }}
              i18nKey="mods.removeSheet.title"
              values={{ destination: destinationLabel, name }}
            />
          </SheetTitle>
          <SheetDescription>{t("mods.removeSheet.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            <p className="text-muted-foreground text-xs">
              <Trans
                components={{ name: <span className="text-foreground" /> }}
                i18nKey="mods.removeSheet.body"
                values={{ destination: destinationLabel, name }}
              />
            </p>
            <p className="text-muted-foreground font-mono text-[11px] break-all">{modpath}</p>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button variant="outline" disabled={isPending} />}>
              {t("common.actions.cancel")}
            </SheetClose>
            <Button variant="destructive" disabled={isPending} onClick={() => removeMod()}>
              {isPending && <Loader2 className="animate-spin" />}
              {t("common.actions.remove")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
