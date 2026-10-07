import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  CircleAlert,
  CircleCheck,
  Download,
  Loader2,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAddModToProfile } from "@/hooks/use-add-mod-to-profile";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { planImport, type ImportPlanEntry, type ModpackManifest } from "@/lib/modpack-manifest";
import { toast } from "@/lib/notify";
import type { ModInfo, OutputMod } from "@/lib/types";

type RowState = { kind: "running" } | { kind: "done" } | { kind: "failed"; message: string };

/**
 * Review-and-install sheet for a RiftLauncher-format modpack manifest. Every
 * listed mod is resolved on the ModDB and downloaded through the download
 * manager, so progress and canceling live in the Downloads sheet.
 */
export function ImportModpackSheet({
  destinationLabel,
  gameVersion,
  installedMods,
  manifest,
  modsDirectory,
  onOpenChange,
  open,
}: {
  destinationLabel: string;
  gameVersion: string;
  installedMods: OutputMod[];
  manifest: ModpackManifest;
  modsDirectory: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [states, setStates] = useState<Record<number, RowState>>({});
  // Frozen when the sheet opens: the installed-mods query is invalidated as
  // downloads land, and the plan must not reshuffle under the running import.
  const [plan] = useState(() => planImport(manifest, installedMods));

  const actionable = plan.filter(({ status }) => status.kind !== "same");
  const finishedCount = Object.values(states).filter(
    (state) => state.kind === "done" || state.kind === "failed",
  ).length;
  const finished = !importing && finishedCount > 0;
  const versionMismatch =
    manifest.gameVersion.length > 0 &&
    gameVersion.length > 0 &&
    manifest.gameVersion !== gameVersion;

  const { mutateAsync: addModToProfile } = useAddModToProfile();

  const setRow = (index: number, state: RowState) =>
    setStates((previous) => ({ ...previous, [index]: state }));

  async function runImport() {
    setImporting(true);
    let installed = 0;
    let failed = 0;

    for (const [index, row] of plan.entries()) {
      if (row.status.kind === "same") continue;
      setRow(index, { kind: "running" });
      try {
        const info = await queryClient.fetchQuery({
          queryKey: ["modInfo", row.entry.modid],
          queryFn: () => invoke("fetch_mod_info", { modid: row.entry.modid }) as Promise<ModInfo>,
          staleTime: 5 * 60 * 1000,
        });
        const release = info.mod.releases.find(
          (candidate) => candidate.modversion === row.entry.version,
        );
        if (!release?.mainfile) {
          throw new Error(
            t("mods.modpackIO.importSheet.missingVersion", { version: row.entry.version }),
          );
        }
        if (row.status.kind === "replace") {
          await invoke("remove_mod_from_profile", {
            params: { modpath: row.status.installed.path, path: modsDirectory },
          });
        }
        await addModToProfile({
          destinationLabel,
          mod: info,
          modsDirectory,
          version: row.entry.version,
        });
        installed += 1;
        setRow(index, { kind: "done" });
      } catch (error) {
        failed += 1;
        setRow(index, {
          kind: "failed",
          message: (error as Error)?.message ?? String(error),
        });
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: installedModsQueryKey(modsDirectory) }),
      queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(modsDirectory) }),
    ]);
    if (failed === 0) {
      toast.success(
        installed > 0
          ? t("mods.modpackIO.importSheet.summary", { count: installed })
          : t("mods.modpackIO.importSheet.upToDate"),
      );
    } else {
      toast.error(t("mods.modpackIO.importSheet.summaryFailed", { count: failed }));
    }
    setImporting(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // The run owns the sheet until it settles; the Download sheet is where
        // an in-flight import is canceled.
        if (!importing) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("mods.modpackIO.importSheet.title")}</SheetTitle>
          <SheetDescription>
            {manifest.gameVersion
              ? t("mods.modpackIO.importSheet.description", {
                  name: manifest.name,
                  version: manifest.gameVersion,
                })
              : manifest.name}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-3 p-4">
            {versionMismatch && (
              <div className="border-warning/40 flex items-start gap-2 border bg-[var(--color-warning)]/5 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
                <p className="text-xs">
                  {t("mods.modpackIO.importSheet.gameVersionMismatch", {
                    packVersion: manifest.gameVersion,
                    profileVersion: gameVersion,
                  })}
                </p>
              </div>
            )}
            {plan.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-xs">
                {t("mods.modpackIO.importSheet.empty")}
              </p>
            ) : (
              <div className="divide-y border">
                {plan.map((row, index) => (
                  <ImportRow key={`${row.entry.modid}-${index}`} row={row} state={states[index]} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs tabular-nums">
              {(importing || finished) &&
                t("mods.modpackIO.importSheet.progress", {
                  done: finishedCount,
                  total: actionable.length,
                })}
            </span>
            <div className="flex gap-2">
              {finished ? (
                <SheetClose render={<Button variant="outline" />}>
                  {t("mods.modpackIO.importSheet.close")}
                </SheetClose>
              ) : (
                <>
                  <SheetClose render={<Button disabled={importing} variant="outline" />}>
                    {t("common.actions.cancel")}
                  </SheetClose>
                  <Button
                    disabled={importing || actionable.length === 0}
                    onClick={() => void runImport()}
                    variant="accent-primary"
                  >
                    {importing && <Loader2 className="animate-spin" />}
                    {actionable.length === 0
                      ? t("mods.modpackIO.importSheet.nothing")
                      : t("mods.modpackIO.importSheet.confirm")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ImportRow({ row, state }: { row: ImportPlanEntry; state: RowState | undefined }) {
  const { t } = useTranslation();
  const label = row.entry.name ?? row.entry.modid;

  return (
    <div className="bg-card flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-muted-foreground truncate font-mono text-[11px]">
          {row.entry.modid} · {row.entry.version}
        </p>
      </div>
      <StatusLine row={row} state={state} t={t} />
    </div>
  );
}

function StatusLine({
  row,
  state,
  t,
}: {
  row: ImportPlanEntry;
  state: RowState | undefined;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (state?.kind === "running") {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {t("mods.modpackIO.importSheet.importing")}
      </span>
    );
  }
  if (state?.kind === "done") {
    return (
      <span className="text-success flex shrink-0 items-center gap-1.5 text-xs">
        <CircleCheck className="size-3.5" />
        {t("mods.modpackIO.importSheet.done")}
      </span>
    );
  }
  if (state?.kind === "failed") {
    return (
      <span
        className="text-destructive flex shrink-0 items-center gap-1.5 text-xs"
        title={state.message}
      >
        <CircleAlert className="size-3.5" />
        {t("mods.modpackIO.importSheet.failed")}
      </span>
    );
  }
  if (row.status.kind === "same") {
    return (
      <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
        <CircleCheck className="size-3.5" />
        {t("mods.modpackIO.importSheet.alreadyInstalled")}
      </span>
    );
  }
  if (row.status.kind === "replace") {
    return (
      <span className="text-accent-amber flex shrink-0 items-center gap-1.5 text-xs">
        <RefreshCcw className="size-3.5" />
        {t("mods.modpackIO.importSheet.replace", {
          from: row.status.installed.version,
          to: row.entry.version,
        })}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
      <Download className="size-3.5" />
      {t("mods.modpackIO.importSheet.willInstall")}
    </span>
  );
}
