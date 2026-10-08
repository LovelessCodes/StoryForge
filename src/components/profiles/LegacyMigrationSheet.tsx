import { invoke } from "@tauri-apps/api/core";
import { Copy, FolderInput } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";
import type { LegacyInstallation, LegacyMigrationReport } from "@/lib/types";

type MigrationMode = "move" | "copy";

interface LegacyMigrationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installations: LegacyInstallation[];
  /** When set, folders are read from this root instead of the previous app's location. */
  root: string | null;
  onImported?: () => Promise<void> | void;
}

/**
 * Sheet that imports installations from the previous Story Forge. The folders
 * are the same data as profiles, so migration is a move/copy plus a manifest
 * rename (see the Rust `legacy` module). Used by the detected-installs banner
 * and by the manual "locate a folder" flow.
 */
export default function LegacyMigrationSheet({
  open,
  onOpenChange,
  installations,
  root,
  onImported,
}: LegacyMigrationSheetProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<MigrationMode>("move");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LegacyMigrationReport | null>(null);

  const pending = installations.filter((item) => !item.already_migrated);

  async function migrate() {
    setBusy(true);
    try {
      const result = await invoke<LegacyMigrationReport>("migrate_legacy_installations", {
        folders: pending.map((item) => item.folder),
        mode,
        root,
      });
      setReport(result);
      await onImported?.();
      if (result.skipped.length > 0) {
        toast.error(t("profiles.import.skipped", { count: result.skipped.length }), {
          description: result.skipped.map((skip) => `${skip.name}: ${skip.reason}`).join(", "),
        });
      } else {
        onOpenChange(false);
      }
    } catch (error) {
      const message = errorMessage(error);
      toast.error(t("profiles.errors.importFailed"), { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setReport(null);
        onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{t("profiles.legacy.title")}</SheetTitle>
          <SheetDescription>{t("profiles.legacy.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-2">
              <span className="text-xs font-medium">{t("profiles.import.modeQuestion")}</span>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[mode]}
                onValueChange={(value) => {
                  const next = value[0] as MigrationMode | undefined;
                  if (next) setMode(next);
                }}
              >
                <ToggleGroupItem value="move">
                  <FolderInput /> {t("common.actions.move")}
                </ToggleGroupItem>
                <ToggleGroupItem value="copy">
                  <Copy /> {t("common.actions.copy")}
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-muted-foreground text-[11px]">
                {mode === "move"
                  ? t("profiles.legacy.modeMoveHint")
                  : t("profiles.legacy.modeCopyHint")}
              </p>
            </div>

            <div className="divide-y border">
              {installations.map((item) => (
                <div key={item.folder} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{item.name}</div>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[11px]">
                      {item.version && <span className="font-mono">v{item.version}</span>}
                      <span>{item.size_display}</span>
                      <span>{t("profiles.modCount", { count: item.mod_count })}</span>
                    </div>
                  </div>
                  {item.already_migrated && (
                    <Badge
                      variant="outline"
                      className="border-[var(--color-success)]/40 text-[var(--color-success)]"
                    >
                      {t("profiles.import.imported")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>

            {report && report.skipped.length > 0 && (
              <div className="border-destructive/30 bg-destructive/5 border p-3">
                <p className="text-destructive text-xs font-medium">
                  {t("profiles.import.skippedFolders", { count: report.skipped.length })}
                </p>
                <ul className="text-muted-foreground mt-1 grid gap-0.5 text-[11px]">
                  {report.skipped.map((skip) => (
                    <li key={skip.name}>
                      <span className="text-foreground font-medium">{skip.name}</span>:{" "}
                      {skip.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={busy || pending.length === 0}
            onClick={() => void migrate()}
          >
            {busy
              ? t("profiles.import.importingBusy")
              : t("profiles.import.submitCount", { count: pending.length })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
