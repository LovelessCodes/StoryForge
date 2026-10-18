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
  type ExtraMod,
  type LockSyncProgress,
  type LockedModState,
  type LockedModStatus,
  type ProfileLockStatus,
  type SyncReport,
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

/** Placeholder shown while the lock status is loading. */
function PackStatusSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-3 w-56" />
    </div>
  );
}

/** First-run state: the profile has no lock yet. */
function PackEmptyState({
  busy,
  creating,
  onCreate,
}: {
  busy: boolean;
  creating: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-xs">{t("profiles.pack.empty")}</p>
      <Button variant="accent-primary" size="sm" disabled={busy} onClick={onCreate}>
        {creating ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
        {t("profiles.pack.create")}
      </Button>
    </div>
  );
}

/** Counts of in-sync, missing, mismatched and extra mods. */
function PackStatusBadges({ status }: { status: ProfileLockStatus }) {
  const { t } = useTranslation();
  return (
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
        <Badge variant="outline">{t("profiles.pack.extras", { count: status.extraCount })}</Badge>
      )}
    </div>
  );
}

/** Progress bar shown while a sync is running. */
function PackSyncProgress({
  active,
  progress,
}: {
  active: boolean;
  progress: LockSyncProgress | null;
}) {
  const { t } = useTranslation();
  if (!active) return null;
  return (
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
  );
}

/** Mods the last sync could not repair. */
function PackFailures({ result }: { result: SyncReport | null | undefined }) {
  const { t } = useTranslation();
  if (!result || result.failed.length === 0) return null;
  return (
    <div className="border-destructive/40 grid gap-1 border p-2">
      <p className="text-destructive flex items-center gap-1.5 text-[11px] font-medium">
        <ShieldAlert className="size-3.5" />
        {t("profiles.pack.failedTitle")}
      </p>
      {result.failed.map((failure) => (
        <p key={`${failure.modid}-${failure.version}`} className="text-[11px]">
          {failure.modid} · {syncFailureMessage(failure.reason)}
        </p>
      ))}
    </div>
  );
}

/** One row per mod the lock pins, with its drift state. */
function PackLockedMods({ entries }: { entries: LockedModStatus[] }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <h3 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {t("profiles.pack.lockedMods")}
      </h3>
      {entries.map((entry) => (
        <div
          key={`${entry.modid}-${entry.version}`}
          className="flex items-center gap-2 border-b py-1.5 last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{entry.modid}</span>
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
  );
}

/** Mods present in the folder that the lock does not name. */
function PackExtraMods({ extras }: { extras: ExtraMod[] }) {
  const { t } = useTranslation();
  if (extras.length === 0) return null;
  return (
    <div className="grid gap-1">
      <h3 className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {t("profiles.pack.extrasTitle")}
      </h3>
      <p className="text-muted-foreground text-[11px]">{t("profiles.pack.extrasHint")}</p>
      {extras.map((extra) => (
        <p key={extra.filename} className="truncate font-mono text-xs">
          {extra.modid} <span className="text-muted-foreground">{extra.version}</span>
        </p>
      ))}
    </div>
  );
}

/** Sync / re-pin / remove actions for an existing lock. */
function PackFooter({
  busy,
  confirmingRemove,
  onConfirmRemoveChange,
  onRemove,
  onRepin,
  onSync,
  pendingCount,
  removing,
  syncing,
}: {
  busy: boolean;
  confirmingRemove: boolean;
  onConfirmRemoveChange: (confirming: boolean) => void;
  onRemove: () => void;
  onRepin: () => void;
  onSync: () => void;
  pendingCount: number;
  removing: boolean;
  syncing: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SheetFooter className="border-t">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button
          variant="accent-primary"
          size="sm"
          disabled={busy || pendingCount === 0}
          onClick={onSync}
        >
          {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("profiles.pack.sync")}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            title={t("profiles.pack.rePinHint")}
            onClick={onRepin}
          >
            <FilePlus2 />
            {t("profiles.pack.rePin")}
          </Button>
          {confirmingRemove ? (
            <>
              <span className="text-destructive text-[11px]">
                {t("profiles.pack.removeConfirm")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onConfirmRemoveChange(false)}>
                {t("common.actions.cancel")}
              </Button>
              <Button variant="destructive" size="sm" disabled={removing} onClick={onRemove}>
                {removing && <Loader2 className="animate-spin" />}
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
              onClick={() => onConfirmRemoveChange(true)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </SheetFooter>
  );
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
  const sync = useApplyProfileLock(profile.id, profile.path);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const busy = create.isPending || remove.isPending || sync.isPending;
  const pendingCount = (status?.missing ?? 0) + (status?.mismatched ?? 0);

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
              <PackStatusSkeleton />
            ) : !status ? (
              <PackEmptyState
                busy={busy}
                creating={create.isPending}
                onCreate={() => create.mutate()}
              />
            ) : (
              <>
                <PackStatusBadges status={status} />
                <PackSyncProgress active={sync.isPending} progress={sync.progress} />
                <PackFailures result={sync.data} />
                <PackLockedMods entries={status.entries} />
                <PackExtraMods extras={status.extras} />
              </>
            )}
          </div>
        </ScrollArea>

        {status && (
          <PackFooter
            busy={busy}
            confirmingRemove={confirmRemove}
            pendingCount={pendingCount}
            removing={remove.isPending}
            syncing={sync.isPending}
            onConfirmRemoveChange={setConfirmRemove}
            onRemove={() => {
              setConfirmRemove(false);
              remove.mutate();
            }}
            onRepin={() => create.mutate()}
            onSync={() => sync.mutate()}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
