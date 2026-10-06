import {
  FilePlus2,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  syncFailureMessage,
  useApplyProfileLock,
  useCreateProfileLock,
  useProfileLockStatus,
  useRemoveProfileLock,
  type LockedModState,
} from "@/hooks/use-profile-lock";
import type { Profile } from "@/stores/profiles";

function stateLabelKey(state: LockedModState) {
  switch (state) {
    case "missing":
      return "profiles.pack.state.missing";
    case "version-mismatch":
      return "profiles.pack.state.versionMismatch";
    case "hash-mismatch":
      return "profiles.pack.state.hashMismatch";
    default:
      return "profiles.pack.state.ok";
  }
}

/**
 * The pack lock for one profile: create it, see drift, sync/repair, remove it.
 *
 * The lock pins the profile's mods to exact versions and SHA-256 hashes. Sync
 * is explicit — it is never applied on launch — and only mods the lock names
 * are touched; extras are reported and left in place.
 */
export default function ProfilePackSheet({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: status, isPending } = useProfileLockStatus(profile.id, open);
  const create = useCreateProfileLock(profile.id);
  const remove = useRemoveProfileLock(profile.id);
  const sync = useApplyProfileLock(profile.id);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const busy = create.isPending || remove.isPending || sync.isPending;
  const pendingCount = (status?.missing ?? 0) + (status?.mismatched ?? 0);
  const progress = sync.progress;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Lock className="size-4" />
            {t("profiles.pack.title")}
          </SheetTitle>
          <SheetDescription>
            {t("profiles.pack.description", { name: profile.name })}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {isPending ? (
              <div className="grid gap-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            ) : !status ? (
              <div className="grid gap-3">
                <p className="text-muted-foreground text-xs">{t("profiles.pack.empty")}</p>
                <Button
                  variant="accent-primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
                  {t("profiles.pack.create")}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">
                    <ShieldCheck className="size-3" />
                    {t("profiles.pack.inSync", { count: status.inSync })}
                  </Badge>
                  {status.missing > 0 && (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      {t("profiles.pack.missing", { count: status.missing })}
                    </Badge>
                  )}
                  {status.mismatched > 0 && (
                    <Badge variant="outline" className="text-[var(--color-warning)]">
                      {t("profiles.pack.mismatched", { count: status.mismatched })}
                    </Badge>
                  )}
                  {status.extraCount > 0 && (
                    <Badge variant="outline">
                      {t("profiles.pack.extras", { count: status.extraCount })}
                    </Badge>
                  )}
                </div>

                {sync.isPending && (
                  <div className="grid gap-2">
                    <p className="text-xs">
                      {progress?.phase === "syncing" && progress.modid
                        ? t("profiles.pack.syncing", {
                            current: progress.current ?? 0,
                            total: progress.total ?? 0,
                            modid: progress.modid,
                          })
                        : t("profiles.pack.sync")}
                    </p>
                    <Progress
                      value={
                        progress?.total && progress.total > 0
                          ? Math.round(((progress.current ?? 0) / progress.total) * 100)
                          : 0
                      }
                    />
                  </div>
                )}

                {sync.data && sync.data.failed.length > 0 && (
                  <div className="border-destructive/40 grid gap-1 border p-2">
                    <p className="text-destructive flex items-center gap-1.5 text-[11px] font-medium">
                      <ShieldAlert className="size-3.5" />
                      {t("profiles.pack.failedTitle")}
                    </p>
                    {sync.data.failed.map((failure) => (
                      <p key={`${failure.modid}-${failure.version}`} className="text-[11px]">
                        {failure.modid} · {syncFailureMessage(failure.reason)}
                      </p>
                    ))}
                  </div>
                )}

                <div className="grid gap-1">
                  <h3 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                    {t("profiles.pack.lockedMods")}
                  </h3>
                  {status.entries.map((entry) => (
                    <div
                      key={`${entry.modid}-${entry.version}`}
                      className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {entry.modid}
                      </span>
                      <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                        {entry.installedVersion && entry.installedVersion !== entry.version
                          ? `${entry.installedVersion} → ${entry.version}`
                          : entry.version}
                      </span>
                      <span
                        className={
                          entry.state === "ok"
                            ? "text-muted-foreground shrink-0 text-[11px]"
                            : entry.state === "missing"
                              ? "text-destructive shrink-0 text-[11px]"
                              : "shrink-0 text-[11px] text-[var(--color-warning)]"
                        }
                      >
                        {t(stateLabelKey(entry.state))}
                      </span>
                    </div>
                  ))}
                </div>

                {status.extras.length > 0 && (
                  <div className="grid gap-1">
                    <h3 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                      {t("profiles.pack.extrasTitle")}
                    </h3>
                    <p className="text-muted-foreground text-[11px]">
                      {t("profiles.pack.extrasHint")}
                    </p>
                    {status.extras.map((extra) => (
                      <p key={extra.filename} className="truncate font-mono text-xs">
                        {extra.modid} <span className="text-muted-foreground">{extra.version}</span>
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {status && (
          <SheetFooter className="border-t">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="accent-primary"
                size="sm"
                disabled={busy || pendingCount === 0}
                onClick={() => sync.mutate()}
              >
                {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t("profiles.pack.sync")}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  title={t("profiles.pack.rePinHint")}
                  onClick={() => create.mutate()}
                >
                  <FilePlus2 />
                  {t("profiles.pack.rePin")}
                </Button>
                {confirmRemove ? (
                  <>
                    <span className="text-destructive text-[11px]">
                      {t("profiles.pack.removeConfirm")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                      {t("common.actions.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => {
                        setConfirmRemove(false);
                        remove.mutate();
                      }}
                    >
                      {remove.isPending && <Loader2 className="animate-spin" />}
                      <Trash2 />
                      {t("profiles.pack.remove")}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                    title={t("profiles.pack.removeHint")}
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
