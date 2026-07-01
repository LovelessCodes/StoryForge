import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { useCallback, useRef } from "react";

import { useMountEffect } from "@/hooks/use-mount-effect";
import type { PausedDownload, ProgressPayload } from "@/lib/types";
import { buildVersionPath, zipfolderprefix } from "@/lib/utils";
import { useDownloadStore } from "@/stores/downloads";
import { useSettingsStore } from "@/stores/settings";

import { installedVersionsQueryKey } from "./use-installed-versions";

const MAX_CONCURRENT = 3;

/** Throttle store updates to once per ~200ms to avoid flooding React renders. */
const lastStoreUpdate = new Map<string, number>();

/** Rolling speed samples per token for ~3s window. */
const speedSamples = new Map<string, { bytes: number; time: number }[]>();

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

  // Resolve paths
  const appFolder = await appDataDir();
  const { versionsParent, versionsSubdir } = useSettingsStore.getState();
  const versionPath = buildVersionPath(versionsParent ?? appFolder, version, versionsSubdir);

  // Get download URL
  const url = (await invoke("get_download_link", { version })) as string;
  if (!url) throw new Error("Download URL not found");

  const evt = eventName(version);

  // Set up progress listener
  const unlisten = await listen<ProgressPayload>(evt, (event) => {
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

  try {
    const result = (await invoke("download_and_maybe_extract", {
      destpath: versionPath,
      emitevent: evt,
      extract: true,
      extractdir: versionPath,
      url,
      zipsubfolderprefix: zipfolderprefix(),
    })) as string;

    if (result === "paused") {
      store.updateEntry(token, { status: "paused" });
    } else if (result === "cancelled") {
      store.removeEntry(token);
    } else if (result === "success") {
      store.updateEntry(token, { status: "done", percent: 100 });
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
    } else if (result === "already_downloaded") {
      store.removeEntry(token);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    store.updateEntry(token, { status: "error", error: message });
  } finally {
    unlisten();
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
  const queryClient = useQueryClient();
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  // On mount: scan for orphaned .resume.json files + process any pending queue
  useMountEffect(() => {
    const qc = qcRef.current;

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

      processQueue(qc);
    })();
  });

  const startDownload = useCallback((version: string) => {
    const store = useDownloadStore.getState();
    const token = version;

    if (store.entries[token]) return;

    store.addEntry({ token, label: version, status: "pending" });
    processQueue(qcRef.current);
  }, []);

  const pause = useCallback((version: string) => {
    void emit(`${eventName(version)}:pause`);
  }, []);

  const resume = useCallback((version: string) => {
    const store = useDownloadStore.getState();
    const token = version;
    const entry = store.entries[token];

    if (!entry || entry.status !== "paused") return;

    store.updateEntry(token, { status: "pending" });
    processQueue(qcRef.current);
  }, []);

  const cancel = useCallback((version: string) => {
    const store = useDownloadStore.getState();
    const entry = store.entries[version];

    void emit(`${eventName(version)}:cancel`);

    // Paused downloads have no active task — clean up partial files directly.
    if (entry?.status === "paused") {
      void invoke("remove_installed_version", { version });
    }

    store.removeEntry(version);
  }, []);

  const retry = useCallback((version: string) => {
    const store = useDownloadStore.getState();
    const token = version;
    const entry = store.entries[token];

    if (!entry || entry.status !== "error") return;

    store.updateEntry(token, {
      status: "pending",
      error: null,
      bytesDownloaded: 0,
      totalBytes: null,
      percent: null,
      speedBps: null,
    });
    processQueue(qcRef.current);
  }, []);

  return { startDownload, pause, resume, cancel, retry };
}
