import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useCallback, useState } from "react";

import { useTauriRunEvents } from "@/hooks/use-tauri-run-events";
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
  const { subscribe, release, eventRef } = useTauriRunEvents();

  const cancel = useCallback(() => {
    setCancelling(true);
    if (eventRef.current) void emit(`${eventRef.current}:cancel`);
  }, [eventRef]);

  const run = useCallback(
    async <T>(command: string, args: Record<string, unknown>) => {
      // One event per run, so an import in another sheet cannot be cancelled by
      // mistake (and the name only holds characters Tauri events allow).
      const event = `import-${Date.now()}`;
      // State first, so a second click cannot start another run while the event
      // listener is still being registered.
      setProgress(null);
      setCancelling(false);
      setBusy(true);
      await subscribe<ImportProgress>(event, setProgress);
      try {
        return await invoke<T>(command, { ...args, emitevent: event });
      } finally {
        release();
        setBusy(false);
        setCancelling(false);
      }
    },
    [release, subscribe],
  );

  return { run, progress, busy, cancelling, cancel };
}
