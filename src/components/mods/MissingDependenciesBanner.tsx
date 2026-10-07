import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useDownloadManager } from "@/hooks/use-download-manager";
import type { MissingDependency } from "@/lib/mod-dependencies";

/** How many entries the summary line names before it truncates. */
const SUMMARY_LIMIT = 3;

/**
 * Strip above the mod list that offers to install dependencies the installed
 * mods name in their `modinfo.json` but that are not installed. The downloads
 * land in the downloads sheet like any other install.
 */
export default function MissingDependenciesBanner({
  destinationLabel,
  missing,
  modsDirectory,
}: {
  destinationLabel: string;
  missing: MissingDependency[];
  modsDirectory: string;
}) {
  const { t } = useTranslation();
  const { installDependencies } = useDownloadManager();
  const [busy, setBusy] = useState(false);

  function describeDependency(dependency: MissingDependency): string {
    const version = dependency.constraint ? ` ${dependency.constraint}` : "";
    const requiredBy =
      dependency.requiredBy.length > 0
        ? ` — ${t("mods.dependencies.requiredBy", { names: dependency.requiredBy.join(", ") })}`
        : "";
    return `${dependency.modid}${version}${requiredBy}`;
  }

  if (missing.length === 0) return null;

  async function install() {
    setBusy(true);
    try {
      await installDependencies(
        missing.map((dependency) => ({
          modid: dependency.modid,
          constraint: dependency.constraint,
        })),
        { detail: destinationLabel, modsDirectory },
      );
    } finally {
      setBusy(false);
    }
  }

  const summary = missing.slice(0, SUMMARY_LIMIT).map(describeDependency).join(" · ");
  const more = missing.length - SUMMARY_LIMIT;

  return (
    <div className="border-warning/40 flex flex-wrap items-center gap-3 border bg-[var(--color-warning)]/5 p-3">
      <AlertTriangle className="size-4 shrink-0 text-[var(--color-warning)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {t("mods.dependencies.missing", {
            count: missing.length,
            destination: destinationLabel,
          })}
        </p>
        <p
          className="text-muted-foreground truncate text-[11px]"
          title={missing.map(describeDependency).join("\n")}
        >
          {summary}
          {more > 0 && ` · ${t("mods.dependencies.more", { count: more })}`}
        </p>
      </div>
      <Button disabled={busy} onClick={() => void install()} size="sm" variant="outline-warning">
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        {t("mods.dependencies.installMissing")}
      </Button>
    </div>
  );
}
