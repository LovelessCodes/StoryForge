import { Braces, FileWarning, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useScanModConflicts } from "@/hooks/use-scan-mod-conflicts";

/**
 * Overlapping content between the installed mods.
 *
 * The scan is informational: overlapping assets and patch targets are
 * sometimes deliberate, so nothing is blocked or removed. It runs when the
 * sheet opens and on demand with "Rescan".
 */
export function ModConflictsSheet({
  modsDirectory,
  onOpenChange,
  open,
}: {
  modsDirectory?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const scan = useScanModConflicts(modsDirectory);
  const { mutate } = scan;

  useEffect(() => {
    if (!open || !modsDirectory) return;
    mutate();
    // `mutate` is stable in TanStack v5; the scan runs once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modsDirectory]);

  const report = scan.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" />
            {t("mods.conflicts.title")}
          </SheetTitle>
          <SheetDescription>{t("mods.conflicts.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            {scan.isPending ? (
              <div className="grid gap-2">
                <p className="text-muted-foreground text-xs">{t("mods.conflicts.scanning")}</p>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !report ? null : report.conflicts.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t("mods.conflicts.empty")}</p>
            ) : (
              <>
                {report.conflicts.map((conflict) => (
                  <div
                    key={`${conflict.kind}-${conflict.path}`}
                    className="grid gap-1.5 border p-3"
                  >
                    <div className="flex items-start gap-2">
                      {conflict.kind === "asset" ? (
                        <FileWarning
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]"
                        />
                      ) : (
                        <Braces
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs" title={conflict.path}>
                          {conflict.path}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {t(
                            conflict.kind === "asset"
                              ? "mods.conflicts.assetKind"
                              : "mods.conflicts.patchKind",
                          )}
                          {conflict.detail
                            ? ` · ${t("mods.conflicts.patchDetail", { path: conflict.detail })}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {conflict.mods.map((mod) => (
                        <Badge key={mod.modid} variant="outline" className="text-[10px]">
                          {mod.name} v{mod.version}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {report.truncated && (
                  <p className="text-muted-foreground text-[11px]">
                    {t("mods.conflicts.truncated", { count: report.conflicts.length })}
                  </p>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            disabled={scan.isPending || !modsDirectory}
            onClick={() => mutate()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={scan.isPending ? "animate-spin" : undefined} />
            {t("mods.conflicts.rescan")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
