import { useMutation } from "@tanstack/react-query";
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

/** Scans a profile's installed mods for overlapping assets and patch targets. */
export const useScanModConflicts = (modsDirectory: string | undefined) =>
  useMutation({
    mutationFn: () => invoke<ConflictReport>("scan_mod_conflicts", { path: modsDirectory }),
    onError: (error) => {
      toast.error(t("mods.conflicts.failed"), { description: errorMessage(error) });
    },
  });
