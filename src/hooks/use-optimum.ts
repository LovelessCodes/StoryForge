import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

import { installedVersionsQueryKey } from "./use-installed-versions";

export type OptimumStatusReason =
  | "unsupported-system"
  | "not-published"
  | "unreachable"
  | "unreadable";

export type OptimumManifestInfo = {
  optimumVersion: string;
  supportedGameVersions: string[];
  rid: string;
  archiveSize: number;
};

export type OptimumStatus = {
  platformSupported: boolean;
  rid: string | null;
  reason: OptimumStatusReason | null;
  manifest: OptimumManifestInfo | null;
};

export type OptimumProgressPhase =
  | "manifest"
  | "download"
  | "extract"
  | "verify"
  | "runtime"
  | "copy"
  | "patch"
  | "done"
  | "cancelled";

export type OptimumProgress = {
  phase: OptimumProgressPhase;
  progress: number;
  message: string | null;
};

export const optimumStatusQueryKey = ["optimumStatus"] as const;

export const useOptimumStatus = (enabled = true) => {
  return useQuery({
    queryKey: optimumStatusQueryKey,
    queryFn: () => invoke<OptimumStatus>("get_optimum_status", { refresh: false }),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
};

/**
 * Tauri event names only allow alphanumerics, `-`, `/`, `:` and `_`.
 */
function optimumEventName(baseVersion: string) {
  return `optimum-install-${baseVersion.replace(/[^a-zA-Z0-9/:_-]/g, "-")}`;
}

type InstallOptimumError = { name?: string; message?: string };

const FAILURE_KEYS: Record<string, string> = {
  "bad-input": "versions.optimum.failure.badInput",
  "unsupported-version": "versions.optimum.failure.unsupportedVersion",
  "patch-conflict": "versions.optimum.failure.patchConflict",
  "decompile-failed": "versions.optimum.failure.engine",
  "assemble-failed": "versions.optimum.failure.engine",
  "engine-internal": "versions.optimum.failure.engine",
  "output-exists": "versions.optimum.failure.engine",
  "source-unavailable": "versions.optimum.failure.engine",
  "no-result": "versions.optimum.failure.engine",
  "verification-failed": "versions.optimum.failure.verification",
  "output-unverified": "versions.optimum.failure.verification",
  "timed-out": "versions.optimum.failure.timedOut",
  "runtime-missing": "versions.optimum.failure.runtimeMissing",
  cancelled: "versions.optimum.toast.cancelled",
};

/** A localized message for an install failure, falling back to its own text. */
export function optimumErrorMessage(error: InstallOptimumError): string {
  const token = error.message ?? "";
  const key = FAILURE_KEYS[token];
  if (key) return t(key);
  if (error.name === "optimum_runtime_missing") return t("versions.optimum.failure.runtimeMissing");
  if (error.name === "optimum_unsupported_version") {
    return t("versions.optimum.failure.unsupportedVersion");
  }
  if (error.name === "optimum_busy") return t("versions.optimum.failure.busy");
  if (error.name === "optimum_incomplete_version") {
    return t("versions.optimum.failure.incomplete");
  }
  if (error.name === "optimum_target_exists") return t("versions.optimum.failure.targetExists");
  return token || String(error.name ?? "");
}

export function useInstallOptimum() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<OptimumProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const eventRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      unlistenRef.current?.();
      unlistenRef.current = null;
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: async ({ baseVersion }: { baseVersion: string }) => {
      const event = optimumEventName(baseVersion);
      eventRef.current = event;
      unlistenRef.current?.();
      unlistenRef.current = await listen<OptimumProgress>(event, (payload) => {
        setProgress(payload.payload);
      });
      try {
        return await invoke<{ version: string; optimumVersion: string }>("install_optimum", {
          baseVersion,
          emitevent: event,
        });
      } finally {
        unlistenRef.current?.();
        unlistenRef.current = null;
        eventRef.current = null;
      }
    },
    onMutate: () => {
      setProgress(null);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: optimumStatusQueryKey });
      toast.success(
        t("versions.optimum.toast.installed", {
          version: result.optimumVersion,
          base: result.version,
        }),
      );
    },
    onError: (error: InstallOptimumError) => {
      if (error.name === "cancelled" || error.message === "cancelled") {
        toast.info(t("versions.optimum.toast.cancelled"));
        return;
      }
      toast.error(t("versions.optimum.toast.failed"), {
        description: optimumErrorMessage(error),
      });
    },
  });

  const cancel = useCallback(() => {
    if (eventRef.current) void emit(`${eventRef.current}:cancel`);
  }, []);

  return { ...mutation, progress, cancel };
}
