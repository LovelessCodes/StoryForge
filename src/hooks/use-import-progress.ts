import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ImportProgress } from "@/lib/types";

/**
 * Runs one import command and streams its progress.
 *
 * Cancelling sends `<event>:cancel`, and the Rust side stops the copy within a
 * chunk and removes the partial folder — folders already imported stay
 * imported, so a retry only has to do the rest.
 */
export function useImportProgress() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const eventRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      unlistenRef.current?.();
      unlistenRef.current = null;
    },
    [],
  );

  const cancel = useCallback(() => {
    setCancelling(true);
    if (eventRef.current) void emit(`${eventRef.current}:cancel`);
  }, []);

  const run = useCallback(async <T>(command: string, args: Record<string, unknown>) => {
    // One event per run, so an import in another sheet cannot be cancelled by
    // mistake (and the name only holds characters Tauri events allow).
    const event = `import-${Date.now()}`;
    eventRef.current = event;
    // State first, so a second click cannot start another run while the event
    // listener is still being registered.
    setProgress(null);
    setCancelling(false);
    setBusy(true);
    unlistenRef.current?.();
    unlistenRef.current = await listen<ImportProgress>(event, (payload) => {
      setProgress(payload.payload);
    });
    try {
      return await invoke<T>(command, { ...args, emitevent: event });
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      eventRef.current = null;
      setBusy(false);
      setCancelling(false);
    }
  }, []);

  return { run, progress, busy, cancelling, cancel };
}
