import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

export type LockedMod = {
  modid: string;
  version: string;
  filename: string | null;
  sha256: string;
};

export type PackLock = {
  lockVersion: number;
  modpackSlug: string | null;
  modpackVersion: string | null;
  createdAt: number;
  mods: LockedMod[];
};

export type LockedModState = "ok" | "missing" | "version-mismatch" | "hash-mismatch";

export type LockedModStatus = {
  modid: string;
  version: string;
  state: LockedModState;
  installedVersion: string | null;
  installedFilename: string | null;
  sha256: string;
};

export type ExtraMod = {
  modid: string;
  version: string;
  filename: string;
};

export type ProfileLockStatus = {
  lock: PackLock;
  entries: LockedModStatus[];
  extras: ExtraMod[];
  inSync: number;
  missing: number;
  mismatched: number;
  extraCount: number;
};

export type SyncFailure = {
  modid: string;
  version: string;
  reason: string;
};

export type SyncReport = {
  applied: string[];
  removed: string[];
  failed: SyncFailure[];
};

export type LockSyncProgress = {
  phase: "syncing" | "done";
  current?: number;
  total?: number;
  modid?: string;
  version?: string;
  applied?: number;
  failed?: number;
};

export const profileLockQueryKey = (profileId: number) => ["profileLock", profileId] as const;

export const useProfileLockStatus = (profileId: number, enabled = true) => {
  return useQuery({
    queryKey: profileLockQueryKey(profileId),
    queryFn: () => invoke<ProfileLockStatus | null>("get_profile_lock_status", { id: profileId }),
    enabled,
    staleTime: 15_000,
  });
};

export const useCreateProfileLock = (profileId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<PackLock>("create_profile_lock", { id: profileId }),
    onSuccess: (lock) => {
      void queryClient.invalidateQueries({ queryKey: profileLockQueryKey(profileId) });
      toast.success(t("profiles.pack.created", { count: lock.mods.length }));
    },
    onError: (error) => {
      toast.error(t("profiles.pack.createFailed"), { description: String(error) });
    },
  });
};

export const useRemoveProfileLock = (profileId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoke("remove_profile_lock", { id: profileId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileLockQueryKey(profileId) });
      toast.success(t("profiles.pack.removed"));
    },
    onError: (error) => {
      toast.error(t("profiles.pack.removeFailed"), { description: String(error) });
    },
  });
};

/** Reasons the backend can report for one failed mod. */
export function syncFailureMessage(reason: string): string {
  if (reason === "hash-mismatch") return t("profiles.pack.failure.hashMismatch");
  if (reason === "version_not_found") return t("profiles.pack.failure.versionNotFound");
  if (reason === "request_error" || reason === "http_error" || reason === "read_response_failed") {
    return t("profiles.pack.failure.network");
  }
  return t("profiles.pack.failure.generic");
}

export function useApplyProfileLock(profileId: number) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<LockSyncProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(
    () => () => {
      unlistenRef.current?.();
      unlistenRef.current = null;
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const event = `profile-lock-${profileId}`;
      unlistenRef.current?.();
      unlistenRef.current = await listen<LockSyncProgress>(event, (payload) => {
        setProgress(payload.payload);
      });
      try {
        return await invoke<SyncReport>("apply_profile_lock", {
          id: profileId,
          emitevent: event,
        });
      } finally {
        unlistenRef.current?.();
        unlistenRef.current = null;
      }
    },
    onMutate: () => {
      setProgress(null);
    },
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: profileLockQueryKey(profileId) });
      if (report.failed.length > 0) {
        toast.warning(
          t("profiles.pack.syncDoneWithFailures", {
            applied: report.applied.length,
            failed: report.failed.length,
          }),
        );
      } else {
        toast.success(t("profiles.pack.syncDone", { count: report.applied.length }));
      }
    },
    onError: (error) => {
      toast.error(t("profiles.pack.syncFailed"), { description: String(error) });
    },
  });

  return { ...mutation, progress };
}
