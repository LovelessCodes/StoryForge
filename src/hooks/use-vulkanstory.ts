import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

import { installedVersionsQueryKey } from "./use-installed-versions";

export type VulkanStoryStatusReason =
  | "unsupported-system"
  | "not-published"
  | "unreachable"
  | "unreadable";

export type VulkanStoryManifestInfo = {
  vulkanstoryVersion: string;
  supportedGameVersions: string[];
  rid: string;
  archiveFilename: string;
  archiveSize: number;
};
export type VulkanStoryStatus = {
  platformSupported: boolean;
  rid: string | null;
  reason: VulkanStoryStatusReason | null;
  manifest: VulkanStoryManifestInfo | null;
};

export type VulkanStoryProgressPhase =
  | "manifest"
  | "download"
  | "copy"
  | "extract"
  | "verify"
  | "done"
  | "cancelled";

export type VulkanStoryProgress = {
  phase: VulkanStoryProgressPhase;
  progress: number;
  message: string | null;
};

export const vulkanStoryStatusQueryKey = ["vulkanStoryStatus"] as const;

export const useVulkanStoryStatus = (enabled = true) => {
  return useQuery({
    queryKey: vulkanStoryStatusQueryKey,
    queryFn: () => invoke<VulkanStoryStatus>("get_vulkanstory_status", { refresh: false }),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
};

/**
 * Tauri event names only allow alphanumerics, `-`, `/`, `:` and `_`.
 */
function vulkanStoryEventName(baseVersion: string) {
  return `vulkanstory-install-${baseVersion.replace(/[^a-zA-Z0-9/:_-]/g, "-")}`;
}

type InstallVulkanStoryError = { name?: string; message?: string };

const NAME_KEYS: Record<string, string> = {
  vulkanstory_bad_input: "versions.vulkanstory.failure.badInput",
  vulkanstory_unsupported_version: "versions.vulkanstory.failure.unsupportedVersion",
  vulkanstory_manifest_unavailable: "versions.vulkanstory.sheet.manifestUnavailable",
  download_error: "versions.vulkanstory.failure.downloadFailed",
  request_error: "versions.vulkanstory.failure.downloadFailed",
  http_error: "versions.vulkanstory.failure.downloadFailed",
  vulkanstory_package_unreadable: "versions.vulkanstory.failure.downloadFailed",
  vulkanstory_verification_failed: "versions.vulkanstory.failure.verification",
  vulkanstory_official_mismatch: "versions.vulkanstory.failure.officialMismatch",
  vulkanstory_busy: "versions.vulkanstory.failure.busy",
  vulkanstory_incomplete_version: "versions.vulkanstory.failure.incomplete",
  vulkanstory_target_exists: "versions.vulkanstory.failure.targetExists",
};

/** A localized message for an install failure, falling back to its own text. */
export function vulkanStoryErrorMessage(error: InstallVulkanStoryError): string {
  const key = NAME_KEYS[error.name ?? ""];
  if (key) return t(key);
  const token = error.message ?? "";
  if (token === "cancelled") return t("versions.vulkanstory.toast.cancelled");
  return token || String(error.name ?? "");
}

export function useInstallVulkanStory() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<VulkanStoryProgress | null>(null);
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
      const event = vulkanStoryEventName(baseVersion);
      eventRef.current = event;
      unlistenRef.current?.();
      unlistenRef.current = await listen<VulkanStoryProgress>(event, (payload) => {
        setProgress(payload.payload);
      });
      try {
        return await invoke<{ version: string; vulkanstoryVersion: string }>(
          "install_vulkanstory",
          {
            baseVersion,
            emitevent: event,
          },
        );
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
      void queryClient.invalidateQueries({ queryKey: vulkanStoryStatusQueryKey });
      toast.success(
        t("versions.vulkanstory.toast.installed", {
          version: result.vulkanstoryVersion,
          base: result.version,
        }),
      );
    },
    onError: (error: InstallVulkanStoryError) => {
      if (error.name === "cancelled" || error.message === "cancelled") {
        toast.info(t("versions.vulkanstory.toast.cancelled"));
        return;
      }
      toast.error(t("versions.vulkanstory.toast.failed"), {
        description: vulkanStoryErrorMessage(error),
      });
    },
  });

  const cancel = useCallback(() => {
    if (eventRef.current) void emit(`${eventRef.current}:cancel`);
  }, []);

  return { ...mutation, progress, cancel };
}
