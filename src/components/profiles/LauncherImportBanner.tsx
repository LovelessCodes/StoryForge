import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Copy, FolderDown, FolderInput, X } from "lucide-react";
import { useState } from "react";

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
import { toast } from "@/lib/notify";
import type { ForeignInstallation, LegacyMigrationReport } from "@/lib/types";
import { useProfilesStore } from "@/stores/profiles";

export interface LauncherImportSource {
  /** Display name, e.g. "VS Launcher". */
  name: string;
  /** Attribution line shown in the sheet. */
  hint: string;
  /** Note about what is (not) carried over in the import. */
  note: string;
  /** Tauri command importing the listed folders. */
  importCommand: string;
  /** Query key holding the detection result (invalidated after import). */
  queryKey: QueryKey;
}

interface LauncherImportBannerProps {
  source: LauncherImportSource;
  items: ForeignInstallation[];
  dismissed: boolean;
  onDismiss: () => void;
}

type ImportMode = "move" | "copy";

/**
 * Dismissible banner + sheet that import installations/modpacks from another
 * launcher. The folders are the same data as profiles, so import is a
 * move/copy plus the manifest conversion (see the Rust importer modules).
 */
export function LauncherImportBanner({
  source,
  items,
  dismissed,
  onDismiss,
}: LauncherImportBannerProps) {
  const queryClient = useQueryClient();
  const { loadProfiles } = useProfilesStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("move");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LegacyMigrationReport | null>(null);

  const pending = items.filter((item) => !item.already_imported);

  async function runImport() {
    setBusy(true);
    try {
      const result = await invoke<LegacyMigrationReport>(source.importCommand, {
        paths: pending.map((item) => item.path),
        mode,
      });
      setReport(result);
      await loadProfiles();
      await queryClient.invalidateQueries({ queryKey: source.queryKey });
      if (result.migrated > 0) {
        toast.success(`Imported ${result.migrated} profile${result.migrated === 1 ? "" : "s"}`);
      }
      if (result.skipped.length > 0) {
        toast.error(`${result.skipped.length} could not be imported`, {
          description: result.skipped.map((skip) => `${skip.name}: ${skip.reason}`).join(", "),
        });
      } else {
        setOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Import failed", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!dismissed && pending.length > 0 && (
        <div className="border-accent-primary/30 bg-accent-primary/5 flex flex-wrap items-center gap-3 border p-3">
          <FolderDown className="text-accent-primary size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">
              {pending.length} {pending.length === 1 ? "item" : "items"} from {source.name} found
            </p>
            <p className="text-muted-foreground text-[11px]">
              Import them with their mods, worlds and settings.
            </p>
          </div>
          <Button
            size="sm"
            variant="accent-primary"
            onClick={() => {
              setReport(null);
              setOpen(true);
            }}
          >
            Import…
          </Button>
          <Button aria-label="Dismiss" size="icon-sm" variant="ghost" onClick={onDismiss}>
            <X />
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Import from {source.name}</SheetTitle>
            <SheetDescription>{source.hint}</SheetDescription>
          </SheetHeader>

          <ScrollArea scrollFade className="min-h-0 flex-1">
            <div className="grid gap-4 p-4">
              <div className="grid gap-2">
                <span className="text-xs font-medium">How should the folders be imported?</span>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  value={[mode]}
                  onValueChange={(value) => {
                    const next = value[0] as ImportMode | undefined;
                    if (next) setMode(next);
                  }}
                >
                  <ToggleGroupItem value="move">
                    <FolderInput /> Move
                  </ToggleGroupItem>
                  <ToggleGroupItem value="copy">
                    <Copy /> Copy
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-muted-foreground text-[11px]">
                  {mode === "move"
                    ? `Relocates the folders into your profiles directory — fast and uses no extra disk, but ${source.name} will no longer see them.`
                    : `Copies the folders and leaves ${source.name} untouched — safe, but uses extra disk space.`}
                </p>
              </div>

              <div className="divide-y border">
                {items.map((item) => (
                  <div key={item.path} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{item.name}</div>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-[11px]">
                        {item.version && <span className="font-mono">v{item.version}</span>}
                        <span>{item.size_display}</span>
                        <span>
                          {item.mod_count} mod{item.mod_count === 1 ? "" : "s"}
                        </span>
                        {item.has_saves && <span>has worlds</span>}
                        {item.is_default_game_data && (
                          <span className="text-[var(--color-warning)]">
                            game&apos;s default data folder
                          </span>
                        )}
                      </div>
                    </div>
                    {item.already_imported && (
                      <Badge
                        variant="outline"
                        className="border-[var(--color-success)]/40 text-[var(--color-success)]"
                      >
                        Imported
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-muted-foreground text-[11px]">{source.note}</p>

              {report && report.skipped.length > 0 && (
                <div className="border-destructive/30 bg-destructive/5 border p-3">
                  <p className="text-destructive text-xs font-medium">
                    {report.skipped.length} folder{report.skipped.length === 1 ? "" : "s"} were not
                    imported
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
              onClick={() => void runImport()}
            >
              {busy
                ? "Importing…"
                : `Import ${pending.length} profile${pending.length === 1 ? "" : "s"}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
