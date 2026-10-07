import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { toast } from "@/lib/notify";
import type { DeletedProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useProfilesStore } from "@/stores/profiles";

export default function DeletedProfilesSection() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const queryClient = useQueryClient();
  const { loadProfiles } = useProfilesStore();
  const [expanded, setExpanded] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);

  const deletedQuery = useQuery({
    queryFn: () => invoke<DeletedProfile[]>("list_deleted_profiles"),
    queryKey: ["deleted-profiles"],
  });

  const restore = useMutation({
    mutationFn: (archiveName: string) =>
      invoke("restore_deleted_profile", { archiveName }) as Promise<unknown>,
    onError: (error: Error) =>
      toast.error(t("profiles.errors.restoreFailed"), { description: error.message }),
    onSuccess: async () => {
      await loadProfiles();
      void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
    },
  });

  const purge = useMutation({
    mutationFn: (archiveName: string) => invoke("purge_deleted_profile", { archiveName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
    },
    onError: (error: Error) =>
      toast.error(t("profiles.errors.purgeFailed"), { description: error.message }),
  });

  const purgeAll = useMutation({
    mutationFn: () => invoke<number>("purge_deleted_profiles"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["deleted-profiles"] });
    },
    onError: (error: Error) =>
      toast.error(t("profiles.errors.purgeFailed"), { description: error.message }),
  });

  const deleted = deletedQuery.data ?? [];
  if (deleted.length === 0) return null;

  return (
    <div className="border">
      <div className="bg-muted/40 flex items-center gap-2 px-3 py-2">
        <button
          className="flex flex-1 items-center gap-2 text-left text-[10px] font-semibold tracking-wider uppercase"
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
          {t("profiles.deleted.heading", { total: deleted.length })}
        </button>
        {confirmPurgeAll ? (
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="destructive"
              disabled={purgeAll.isPending}
              onClick={() => {
                purgeAll.mutate();
                setConfirmPurgeAll(false);
              }}
            >
              {t("profiles.deleted.confirmPurgeAll")}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmPurgeAll(false)}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        ) : (
          <Button size="xs" variant="ghost" onClick={() => setConfirmPurgeAll(true)}>
            {t("profiles.deleted.purgeAll")}
          </Button>
        )}
      </div>

      {expanded && (
        <ScrollArea scrollFade className="max-h-64">
          <ul className="divide-y">
            {deleted.map((item) => (
              <li key={item.archive_name} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{item.name}</div>
                  <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                    <span className="font-mono">v{item.version}</span>
                    <span>{t("profiles.modCount", { count: item.mod_count })}</span>
                    {item.deleted_at > 0 && (
                      <span>
                        {t("profiles.deleted.deletedAt", {
                          time: formatDistanceToNow(new Date(item.deleted_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          }),
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(item.archive_name)}
                >
                  <RotateCcw /> {t("common.actions.restore")}
                </Button>
                {confirmPurge === item.archive_name ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={purge.isPending}
                      onClick={() => {
                        purge.mutate(item.archive_name);
                        setConfirmPurge(null);
                      }}
                    >
                      {t("profiles.deleted.confirmYes")}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setConfirmPurge(null)}>
                      {t("profiles.deleted.confirmNo")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    aria-label={t("profiles.deleted.deletePermanently", { name: item.name })}
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setConfirmPurge(item.archive_name)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
