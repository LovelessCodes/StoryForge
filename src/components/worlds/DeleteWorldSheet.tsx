import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { addSeconds, formatDistance, formatDistanceToNow } from "date-fns";
import { useId, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";

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
import { useDateLocale } from "@/lib/i18n/date-locale";
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
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
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
      toast.loading(t("worlds.delete.deleting", { name: data.world_name }), { id: toastId });
    },
    onError: (error) => {
      toast.error(t("worlds.delete.failed", { name: data.world_name }), {
        description: error.message,
        id: toastId,
      });
    },
    onSuccess: () => {
      toast.dismiss(toastId);
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={(next) => !remove.isPending && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            <Trans
              components={{ name: <span className="text-destructive" /> }}
              i18nKey="worlds.delete.title"
              values={{ name: data.world_name }}
            />
          </SheetTitle>
          <SheetDescription>{t("worlds.delete.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="border-warning/40 bg-warning/10 grid gap-3 border p-3 text-[11px]">
              <p className="text-[var(--color-warning)]">
                <b>{t("worlds.delete.warning")}</b> {t("worlds.delete.warningText")}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <Fact label={t("worlds.delete.facts.worldName")} value={data.world_name} />
                <Fact
                  label={t("worlds.delete.facts.mapIdentifier")}
                  value={data.savegame_identifier}
                />
                <Fact label={t("worlds.delete.facts.worldType")} value={data.world_type} />
                <Fact label={t("worlds.delete.facts.playStyle")} value={data.play_style} />
                <Fact
                  label={t("worlds.delete.facts.createdBy")}
                  value={data.created_by_player_name}
                />
                <Fact
                  label={t("worlds.delete.facts.lastPlayed")}
                  value={
                    data.last_played
                      ? formatDistanceToNow(new Date(data.last_played), {
                          addSuffix: true,
                          locale: dateLocale,
                        })
                      : t("common.states.never")
                  }
                />
                <Fact
                  label={t("worlds.delete.facts.lastSession")}
                  value={formatDistance(EPOCH, addSeconds(EPOCH, data.total_seconds_played), {
                    locale: dateLocale,
                  })}
                />
                <Fact label={t("worlds.delete.facts.seed")} value={data.seed} />
                <Fact
                  label={t("worlds.delete.facts.createdVersion")}
                  value={data.created_game_version}
                />
                <Fact
                  label={t("worlds.delete.facts.lastSavedVersion")}
                  value={data.last_saved_game_version ?? "—"}
                />
              </dl>
            </div>

            <label className="flex items-center gap-2 text-xs" htmlFor={confirmId}>
              <Switch
                checked={sure}
                id={confirmId}
                onCheckedChange={setSure}
                size="sm"
                aria-label={t("worlds.delete.confirmAria")}
              />
              {t("worlds.delete.confirmLabel")}
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
              {t("common.actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || !sure}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? t("worlds.delete.pending") : t("common.actions.delete")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
