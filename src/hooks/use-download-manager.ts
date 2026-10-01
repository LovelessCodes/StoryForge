import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { useCallback } from "react";

import { useMountEffect } from "@/hooks/use-mount-effect";
import { buildVersionPath, zipfolderprefix } from "@/lib/helpers";
import type { PausedDownload, ProgressPayload } from "@/lib/types";
import { claimVersionDownload, releaseVersionDownload } from "@/lib/version-download-lock";
import { useDownloadStore } from "@/stores/downloads";
import { useSettingsStore } from "@/stores/settings";

import { installedVersionsQueryKey } from "./use-installed-versions";

const MAX_CONCURRENT = 3;

/**
 * The queue bootstrap (resume-manifest scan) only needs to run once per app
 * session. Every component calling useDownloadManager used to scan the disk on
 * mount - including once per visible download row.
 */
let bootstrapStarted = false;

/** Pauses requested before the Rust command started listening. */
const pauseRequests = new Set<string>();

/** Throttle store updates to once per ~200ms to avoid flooding React renders. */
const lastStoreUpdate = new Map<string, number>();

/** Rolling speed samples per token for ~3s window. */
const speedSamples = new Map<string, { bytes: number; time: number }[]>();

/**
 * Callers that need to continue after a download finishes (importing a
 * profile or modpack waits for its game version) subscribe here instead of
 * polling the store.
 */
type DownloadWaiter = { resolve: () => void; reject: (error: Error) => void };
const completionWaiters = new Map<string, DownloadWaiter[]>();

function settleWaiters(token: string, error?: Error) {
  const waiters = completionWaiters.get(token);
  if (!waiters) return;
  completionWaiters.delete(token);
  for (const waiter of waiters) {
    if (error) waiter.reject(error);
    else waiter.resolve();
  }
}

/**
 * Resolves when the version's download finishes, rejects on failure or
 * cancellation. A missing entry rejects; an already-finished entry resolves.
 */
export function waitForDownload(version: string): Promise<void> {
  const entry = useDownloadStore.getState().entries[version];
  if (!entry) return Promise.reject(new Error("Download is not queued"));
  if (entry.status === "done") return Promise.resolve();
  if (entry.status === "error") {
    return Promise.reject(new Error(entry.error ?? "Download failed"));
  }
  return new Promise((resolve, reject) => {
    const waiters = completionWaiters.get(version) ?? [];
    waiters.push({ resolve, reject });
    completionWaiters.set(version, waiters);
  });
}

function recordSpeedSample(token: string, bytesDownloaded: number) {
  const now = performance.now();
  const samples = speedSamples.get(token) ?? [];
  samples.push({ bytes: bytesDownloaded, time: now });

  // Keep only samples within the last ~3s
  const cutoff = now - 3500;
  while (samples.length > 0 && samples[0].time < cutoff) {
    samples.shift();
  }

  speedSamples.set(token, samples);
}

function computeSpeed(token: string): number | null {
  const samples = speedSamples.get(token);
  if (!samples || samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = (last.time - first.time) / 1000; // seconds
  if (elapsed <= 0) return null;

  const bytesDelta = last.bytes - first.bytes;
  return bytesDelta / elapsed;
}

function eventName(version: string): string {
  return `download://version:${version.replace(/\./g, "_")}`;
}

async function doDownload(
  token: string,
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  const store = useDownloadStore.getState();
  const version = token;

  store.updateEntry(token, { status: "downloading", speedBps: null });

  let unlisten: UnlistenFn | null = null;

  try {
    if (!claimVersionDownload(version)) {
      throw new Error("This version is already downloading");
    }

    // Resolve paths
    const appFolder = await appDataDir();
    const { versionsParent, versionsSubdir } = useSettingsStore.getState();
    const versionPath = buildVersionPath(versionsParent ?? appFolder, version, versionsSubdir);

    // Get download URL
    const url = (await invoke("get_download_link", { version })) as string;
    if (!url) throw new Error("Download URL not found");

    // Cancelled while resolving the URL: cancel() removed the entry, so don't
    // start a ghost download that nobody can see or stop.
    if (!useDownloadStore.getState().entries[token]) return;

    const evt = eventName(version);

    // Set up progress listener
    unlisten = await listen<ProgressPayload>(evt, (event) => {
      const { phase, downloaded, total, percent } = event.payload;

      if (phase === "download") {
        const bytesDownloaded = downloaded ?? 0;
        recordSpeedSample(token, bytesDownloaded);
        const speedBps = computeSpeed(token);

        // Throttle: only push to React store every ~200ms
        const now = performance.now();
        const last = lastStoreUpdate.get(token) ?? 0;
        if (now - last >= 200) {
          lastStoreUpdate.set(token, now);
          store.updateEntry(token, {
            bytesDownloaded,
            totalBytes: total ?? null,
            percent: percent ?? null,
            speedBps,
          });
        }
      } else if (phase === "extract") {
        store.updateEntry(token, { status: "extracting" });
      } else if (phase === "paused") {
        store.updateEntry(token, { status: "paused" });
      } else if (phase === "done") {
        store.updateEntry(token, { status: "done", percent: 100, speedBps: null });
      }
    });

    // A pause requested during setup never reached Rust; honour it here.
    if (pauseRequests.delete(token)) {
      store.updateEntry(token, { status: "paused" });
      return;
    }

    const result = (await invoke("download_and_maybe_extract", {
      params: {
        destpath: versionPath,
        emitevent: evt,
        extract: true,
        extractdir: versionPath,
        url,
        zipsubfolderprefix: zipfolderprefix(),
      },
    })) as string;

    if (result === "paused") {
      store.updateEntry(token, { status: "paused" });
    } else if (result === "cancelled") {
      store.removeEntry(token);
      settleWaiters(token, new Error("Download cancelled"));
    } else if (result === "success") {
      store.updateEntry(token, { status: "done", percent: 100 });
      settleWaiters(token);
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
    } else if (result === "already_downloaded") {
      store.removeEntry(token);
      settleWaiters(token);
      // The version is on disk: refresh the list even though nothing downloaded.
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    store.updateEntry(token, { status: "error", error: message });
    settleWaiters(token, new Error(message));
  } finally {
    releaseVersionDownload(version);
    pauseRequests.delete(token);
    unlisten?.();
    speedSamples.delete(token);
    lastStoreUpdate.delete(token);
    // Process next in queue
    processQueue(queryClient);
  }
}

function processQueue(queryClient: ReturnType<typeof useQueryClient>): void {
  const store = useDownloadStore.getState();
  const active = Object.values(store.entries).filter(
    (e) => e.status === "downloading" || e.status === "extracting",
  ).length;

  if (active >= MAX_CONCURRENT) return;

  const next = Object.values(store.entries).find((e) => e.status === "pending");
  if (!next) return;

  // Fire and forget — errors handled inside doDownload
  void doDownload(next.token, queryClient);
}

export function useDownloadManager() {
  // `queryClient` is a stable reference from the provider, so it can be used
  // directly; a ref to keep it "current" was only writing during render.
  const queryClient = useQueryClient();

  // On mount: scan for orphaned .resume.json files + process any pending queue.
  // Runs once per session, no matter how many components use this hook.
  useMountEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    void (async () => {
      const appFolder = await appDataDir();
      const { versionsParent, versionsSubdir } = useSettingsStore.getState();
      const versionRoot = versionsParent ?? appFolder;
      const scanDirs = [versionRoot];
      if (versionsSubdir) {
        scanDirs.push(`${versionRoot}/${versionsSubdir}`);
      }

      const paused = await invoke<PausedDownload[]>("scan_resume_manifests", { dirs: scanDirs });
      const store = useDownloadStore.getState();
      for (const p of paused) {
        if (!store.entries[p.label]) {
          store.addEntry({ token: p.label, label: p.label, status: "paused" });
        }
      }

      processQueue(queryClient);
    })();
  });

  const startDownload = useCallback(
    (version: string) => {
      const store = useDownloadStore.getState();
      const token = version;

      if (store.entries[token]) return;
      pauseRequests.delete(token);

      store.addEntry({ token, label: version, status: "pending" });
      processQueue(queryClient);
    },
    [queryClient],
  );

  const pause = useCallback((version: string) => {
    // Recorded in case the command has not started listening yet.
    pauseRequests.add(version);
    void emit(`${eventName(version)}:pause`);
  }, []);

  const resume = useCallback(
    (version: string) => {
      const store = useDownloadStore.getState();
      const token = version;
      const entry = store.entries[token];

      if (!entry || entry.status !== "paused") return;

      pauseRequests.delete(token);
      store.updateEntry(token, { status: "pending" });
      processQueue(queryClient);
    },
    [queryClient],
  );

  const cancel = useCallback((version: string) => {
    const store = useDownloadStore.getState();
    const entry = store.entries[version];

    pauseRequests.delete(version);
    void emit(`${eventName(version)}:cancel`);

    // Paused downloads have no active task — clean up partial files directly.
    if (entry?.status === "paused") {
      void invoke("remove_installed_version", { version });
    }

    store.removeEntry(version);
    settleWaiters(version, new Error("Download cancelled"));
  }, []);

  const retry = useCallback(
    (version: string) => {
      const store = useDownloadStore.getState();
      const token = version;
      const entry = store.entries[token];

      if (!entry || entry.status !== "error") return;

      pauseRequests.delete(token);
      store.updateEntry(token, {
        status: "pending",
        error: null,
        bytesDownloaded: 0,
        totalBytes: null,
        percent: null,
        speedBps: null,
      });
      processQueue(queryClient);
    },
    [queryClient],
  );

  return { startDownload, pause, resume, cancel, retry };
}
