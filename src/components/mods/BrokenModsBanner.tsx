import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { FileWarning, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { toast } from "@/lib/notify";
import type { ModScanError, OutputMod } from "@/lib/types";

export type DuplicateModGroup = { modid: string; mods: OutputMod[] };

function fileBase(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

/**
 * Strip above the mod list for files the scan could not read and for modids
 * provided by more than one zip. Both are removable inline; the confirmation
 * flips the row's trash button instead of opening a dialog.
 */
export default function BrokenModsBanner({
  destinationLabel,
  duplicates,
  errors,
  modsDirectory,
}: {
  destinationLabel: string;
  duplicates: DuplicateModGroup[];
  errors: ModScanError[];
  modsDirectory: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string | null>(null);

  const { mutate: removeFile, isPending } = useMutation({
    mutationFn: ({ modpath }: { modpath: string }) =>
      invoke("remove_mod_from_profile", { params: { modpath, path: modsDirectory } }),
    onError: (error, variables) => {
      toast.error(
        t("mods.issues.removeFailed", {
          file: fileBase(variables.modpath),
          message: error.message,
        }),
      );
    },
    onSuccess: () => {
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) });
      void queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) });
    },
  });

  if (errors.length === 0 && duplicates.length === 0) return null;

  const rows = [
    ...errors.map((error) => {
      const zipPath = error.file.split("::")[0];
      return {
        detail: error.message,
        key: `error-${error.file}`,
        label: fileBase(zipPath),
        path: zipPath,
        removable: zipPath.toLowerCase().endsWith(".zip"),
      };
    }),
    ...duplicates.flatMap((group) =>
      group.mods.map((mod) => ({
        detail: t("mods.issues.duplicateDetail", { modid: group.modid }),
        key: `duplicate-${mod.path}`,
        label: `${mod.name} v${mod.version} — ${fileBase(mod.path)}`,
        path: mod.path,
        removable: true,
      })),
    ),
  ];

  return (
    <div className="border-destructive/40 bg-destructive/5 flex items-start gap-3 border p-3">
      <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {t("mods.issues.title", { destination: destinationLabel })}
        </p>
        <p className="text-muted-foreground text-[11px]">{t("mods.issues.description")}</p>
        <div className="mt-2 grid gap-1">
          {rows.map((row) => (
            <div className="flex items-center gap-2" key={row.key}>
              <FileWarning className="text-destructive size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={row.path}>
                {row.label}
              </span>
              <span
                className="text-muted-foreground hidden max-w-[45%] truncate text-[11px] sm:inline"
                title={row.detail}
              >
                {row.detail}
              </span>
              {!row.removable ? null : confirming === row.key ? (
                <Button
                  disabled={isPending}
                  onClick={() => removeFile({ modpath: row.path })}
                  size="sm"
                  variant="destructive"
                >
                  {t("mods.issues.confirmRemove")}
                </Button>
              ) : (
                <Button
                  aria-label={t("mods.issues.remove")}
                  disabled={isPending}
                  onClick={() => setConfirming(row.key)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-[11px]">{t("mods.issues.hint")}</p>
      </div>
    </div>
  );
}
