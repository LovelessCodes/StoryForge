import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { format, formatDistanceToNow } from "date-fns";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { profileBackupsQueryKey, useProfileBackups } from "@/hooks/use-profile-backups";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { toast } from "@/lib/notify";
import { type Profile, useProfilesStore } from "@/stores/profiles";

type BackupEvent = {
  phase: "backing-up" | "restoring" | "done" | "error";
  current?: number;
  total?: number;
  message?: string;
};

interface ProfileBackupsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Backup snapshots of a profile's data folder: create, restore and delete
 * them, and configure the automatic pre-launch backup.
 */
export default function ProfileBackupsSheet({
  open,
  onOpenChange,
  profile,
}: ProfileBackupsSheetProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const queryClient = useQueryClient();
  const loadProfiles = useProfilesStore((s) => s.loadProfiles);
  const backupsQuery = useProfileBackups(profile.id);
  const backups = backupsQuery.data ?? [];

  const [busy, setBusy] = useState<"create" | "restore" | "delete" | null>(null);
  const [progress, setProgress] = useState<{
    phase: string;
    current: number;
    total: number;
  } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Optimistic drafts that follow the store when it changes (including the
  // revert after a failed save). Adjusting during render keeps the switch and
  // number field responsive without an effect.
  const [onPlayDraft, setOnPlayDraft] = useState(profile.backupOnPlay);
  const [trackedOnPlay, setTrackedOnPlay] = useState(profile.backupOnPlay);
  if (trackedOnPlay !== profile.backupOnPlay) {
    setTrackedOnPlay(profile.backupOnPlay);
    setOnPlayDraft(profile.backupOnPlay);
  }
  const backupOnPlay = trackedOnPlay === profile.backupOnPlay ? onPlayDraft : profile.backupOnPlay;

  const [limitDraft, setLimitDraft] = useState(profile.backupLimit);
  const [trackedLimit, setTrackedLimit] = useState(profile.backupLimit);
  if (trackedLimit !== profile.backupLimit) {
    setTrackedLimit(profile.backupLimit);
    setLimitDraft(profile.backupLimit);
  }
  const backupLimit = trackedLimit === profile.backupLimit ? limitDraft : profile.backupLimit;

  // Progress for this sheet's own jobs; the launch flow listens separately.
  useEffect(() => {
    if (!open) return undefined;
    let unlisten: (() => void) | null = null;
    void listen<BackupEvent>(`backup-${profile.id}`, (event) => {
      const { phase, current, total } = event.payload;
      if (phase === "backing-up" || phase === "restoring") {
        setProgress({ phase, current: current ?? 0, total: total ?? 0 });
      } else {
        setProgress(null);
      }
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, [open, profile.id]);

  const percent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  async function refreshList() {
    await queryClient.invalidateQueries({ queryKey: profileBackupsQueryKey(profile.id) });
  }

  async function backupNow() {
    setBusy("create");
    try {
      await invoke("create_profile_backup", { profileId: profile.id });
      await refreshList();
    } catch (error) {
      toast.error(t("profiles.backups.backupFailed"), { description: messageOf(error) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function doRestore(id: string) {
    setBusy("restore");
    setConfirmRestore(null);
    try {
      await invoke("restore_profile_backup", { profileId: profile.id, backupId: id });
      toast.success(t("profiles.backups.restored"), {
        description: t("profiles.backups.restoredDescription"),
      });
      // Mods, worlds and configs on disk were rewritten: refresh every reader.
      await queryClient.invalidateQueries();
      await loadProfiles();
    } catch (error) {
      toast.error(t("profiles.errors.restoreFailed"), { description: messageOf(error) });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function doDelete(id: string) {
    setBusy("delete");
    setConfirmDelete(null);
    try {
      await invoke("delete_profile_backup", { profileId: profile.id, backupId: id });
      await refreshList();
    } catch (error) {
      toast.error(t("profiles.backups.deleteFailed"), { description: messageOf(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(nextOnPlay: boolean, nextLimit: number) {
    try {
      await invoke("set_profile_backup_settings", {
        profileId: profile.id,
        backupOnPlay: nextOnPlay,
        backupLimit: nextLimit,
      });
    } catch (error) {
      toast.error(t("profiles.backups.settingsFailed"), { description: messageOf(error) });
    } finally {
      // Success or failure: the store reload resets the drafts to disk state.
      await loadProfiles();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{t("profiles.backups.title", { name: profile.name })}</SheetTitle>
          <SheetDescription>{t("profiles.backups.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {/* Automatic backups */}
            <div className="grid gap-3 border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">{t("profiles.backups.autoLabel")}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {t("profiles.backups.autoHint")}
                  </p>
                </div>
                <Switch
                  aria-label={t("profiles.backups.autoLabel")}
                  checked={backupOnPlay}
                  disabled={busy !== null}
                  onCheckedChange={(checked) => {
                    setOnPlayDraft(checked);
                    void saveSettings(checked, backupLimit);
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium">{t("profiles.backups.keepLabel")}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {t("profiles.backups.keepHint")}
                  </p>
                </div>
                <NumberField
                  max={50}
                  min={1}
                  value={backupLimit}
                  onValueChange={(next) => {
                    if (next === null) return;
                    const clamped = Math.min(50, Math.max(1, next));
                    setLimitDraft(clamped);
                    void saveSettings(backupOnPlay, clamped);
                  }}
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement />
                    <NumberFieldInput />
                    <NumberFieldIncrement />
                  </NumberFieldGroup>
                </NumberField>
              </div>
            </div>

            {/* Manual backup */}
            <div className="grid gap-2">
              <Button disabled={busy !== null} onClick={() => void backupNow()}>
                {busy === "create" ? <Loader2 className="animate-spin" /> : <Archive />}
                {t("profiles.backups.backupNow")}
              </Button>
              {progress && (
                <div className="grid gap-1">
                  <Progress value={percent} />
                  <p className="text-muted-foreground text-[11px]">
                    {progress.phase === "restoring"
                      ? t("profiles.backups.restoringProgress", { percent })
                      : t("profiles.backups.backingUpProgress", { percent })}
                  </p>
                </div>
              )}
            </div>

            {/* Snapshots */}
            {backupsQuery.isPending ? (
              <div className="grid gap-2">
                {[0, 1, 2].map((index) => (
                  <div className="bg-muted h-14 animate-pulse" key={index} />
                ))}
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-8 text-center">
                <Archive className="text-muted-foreground size-6" />
                <div>
                  <p className="text-sm font-medium">{t("profiles.backups.emptyTitle")}</p>
                  <p className="text-muted-foreground text-xs">
                    {t("profiles.backups.emptyDescription")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-muted-foreground text-[11px]">
                  {t("profiles.backups.count", { count: backups.length })}
                </p>
                {backups.map((backup) => (
                  <div className="grid gap-2 border p-3" key={backup.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="grid gap-0.5">
                        <p className="text-xs font-medium">
                          {format(new Date(backup.created_at), "PPp", { locale: dateLocale })}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {formatDistanceToNow(new Date(backup.created_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}{" "}
                          · {backup.size_display}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          disabled={busy !== null}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setConfirmDelete(null);
                            setConfirmRestore(backup.id);
                          }}
                        >
                          {t("common.actions.restore")}
                        </Button>
                        <Button
                          aria-label={t("profiles.backups.deleteBackup")}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy !== null}
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => {
                            setConfirmRestore(null);
                            setConfirmDelete(backup.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    {confirmRestore === backup.id && (
                      <div className="border-warning/40 bg-warning/5 grid gap-2 border p-2">
                        <p className="text-[11px]">{t("profiles.backups.confirmRestore")}</p>
                        <div className="flex items-center gap-2">
                          <Button
                            disabled={busy !== null}
                            size="sm"
                            variant="accent-primary"
                            onClick={() => void doRestore(backup.id)}
                          >
                            {busy === "restore" ? <Loader2 className="animate-spin" /> : null}
                            {t("profiles.backups.restoreBackup")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmRestore(null)}>
                            {t("common.actions.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {confirmDelete === backup.id && (
                      <div className="border-destructive/40 bg-destructive/5 grid gap-2 border p-2">
                        <p className="text-[11px]">{t("profiles.backups.confirmDelete")}</p>
                        <div className="flex items-center gap-2">
                          <Button
                            disabled={busy !== null}
                            size="sm"
                            variant="destructive"
                            onClick={() => void doDelete(backup.id)}
                          >
                            {t("profiles.backups.deleteBackup")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            {t("common.actions.cancel")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
