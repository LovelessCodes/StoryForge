import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { errorMessage } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

export type ConflictMod = {
  modid: string;
  name: string;
  version: string;
};

export type ModConflict = {
  kind: "asset" | "patch";
  path: string;
  /** Overlapping JSON pointers, for patch conflicts. */
  detail: string | null;
  mods: ConflictMod[];
};

export type ConflictReport = {
  conflicts: ModConflict[];
  scanned: number;
  truncated: boolean;
};

/**
 * Scans a profile's installed mods for overlapping assets and patch targets.
 *
 * Read-only scan modeled as a lazily-triggered query: the consumers call
 * `refetch` when the sheet opens and on demand. The last report per profile
 * stays cached, so reopening the sheet shows it again while the fresh scan
 * runs.
 */
export const useScanModConflicts = (modsDirectory: string | undefined) =>
  useQuery({
    queryKey: ["modConflicts", modsDirectory],
    queryFn: async () => {
      try {
        return await invoke<ConflictReport>("scan_mod_conflicts", { path: modsDirectory });
      } catch (error) {
        toast.error(t("mods.conflicts.failed"), { description: errorMessage(error) });
        throw error;
      }
    },
    enabled: false,
    retry: false,
  });
