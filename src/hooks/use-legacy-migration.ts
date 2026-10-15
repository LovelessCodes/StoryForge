import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LegacyMigrationProgress, LegacyMigrationReport } from "@/lib/types";

export type LegacyMigrationMode = "move" | "copy";

/**
 * Runs one import from the previous Story Forge and streams its progress.
 *
 * An installation can be many gigabytes, and copying it used to look like the
 * import had hung; the sheet therefore names the folder being imported on every
 * step. Cancelling sends `<event>:cancel`, and the Rust side stops the copy
 * within a chunk and removes the partial folder — folders already imported stay
 * imported, so a retry only has to do the rest.
 */
export function useLegacyMigration() {
  const [progress, setProgress] = useState<LegacyMigrationProgress | null>(null);
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

  const migrate = useCallback(
    async (folders: string[], mode: LegacyMigrationMode, root: string | null) => {
      // One event per run, so an import in another sheet cannot be cancelled
      // by mistake (and the name only holds characters Tauri events allow).
      const event = `legacy-migration-${Date.now()}`;
      eventRef.current = event;
      // State first, so a second click cannot start another run while the
      // event listener is still being registered.
      setProgress(null);
      setCancelling(false);
      setBusy(true);
      unlistenRef.current?.();
      unlistenRef.current = await listen<LegacyMigrationProgress>(event, (payload) => {
        setProgress(payload.payload);
      });
      try {
        return await invoke<LegacyMigrationReport>("migrate_legacy_installations", {
          folders,
          mode,
          root,
          emitevent: event,
        });
      } finally {
        unlistenRef.current?.();
        unlistenRef.current = null;
        eventRef.current = null;
        setBusy(false);
        setCancelling(false);
      }
    },
    [],
  );

  return { migrate, progress, busy, cancelling, cancel };
}
