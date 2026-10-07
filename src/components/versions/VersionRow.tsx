import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Box, FolderOpen, Gauge, Link2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  installedVersionsQueryKey,
  useInstalledVersions,
  type InstalledVersion,
} from "@/hooks/use-installed-versions";
import { linkableVersionsQueryKey } from "@/hooks/use-linkable-versions";
import { useOptimumStatus } from "@/hooks/use-optimum";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import {
  baseGameVersion,
  compareSemverDesc,
  isOptimumVersion,
  optimumVersionName,
} from "@/lib/helpers";
import { toast } from "@/lib/notify";

export default function VersionRow({
  version,
  onOptimum,
}: {
  version: InstalledVersion;
  onOptimum: (baseVersion: string) => void;
}) {
  const { t } = useTranslation();
  const { mutate: openFolder } = useRevealInFolder();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data: optimumStatus } = useOptimumStatus();
  const { data: versions } = useInstalledVersions();

  const { mutate: removeVersion, isPending } = useMutation({
    mutationFn: (name: string) => invoke<string>("remove_installed_version", { version: name }),
    onMutate: () => {
      toast.loading(
        version.external
          ? t("versions.toast.unlinking", { name: version.name })
          : t("versions.toast.deleting", { name: version.name }),
        { id: `version-delete-${version.name}` },
      );
    },
    onSuccess: () => {
      toast.dismiss(`version-delete-${version.name}`);
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: linkableVersionsQueryKey });
    },
    onError: (error) => {
      toast.error(
        version.external
          ? t("versions.toast.unlinkFailed", { name: version.name, message: error.message })
          : t("versions.toast.deleteFailed", { name: version.name, message: error.message }),
        { id: `version-delete-${version.name}` },
      );
    },
  });

  const isRc = version.name.includes("rc");
  const folderMissing = version.external && version.size_bytes === 0;

  // Optimum: a vanilla row offers an install when no Optimum build of it
  // exists yet; an Optimum row offers an update when the newest published
  // overlay still supports its base version and is newer than the installed
  // one.
  const base = baseGameVersion(version.name);
  const isOptimum = isOptimumVersion(version.name);
  const optimumBuild = (versions ?? []).find((v) => v.name === optimumVersionName(base));
  const manifest = optimumStatus?.manifest ?? null;
  const manifestSupports = !!manifest && manifest.supportedGameVersions.includes(base);
  const canInstall =
    !isOptimum &&
    !optimumBuild &&
    !!optimumStatus?.platformSupported &&
    manifestSupports &&
    !folderMissing;
  const canUpdate =
    isOptimum &&
    !!manifest &&
    manifestSupports &&
    compareSemverDesc(manifest.optimumVersion, version.optimum_version ?? "0") < 0;
  // Vanilla rows offer Optimum whenever the platform has a build, enabled only
  // when the newest overlay supports this game version.
  const offerOptimum =
    !isOptimum && !optimumBuild && !!optimumStatus?.platformSupported && !folderMissing;
  const optimumTitle = !manifest
    ? t("versions.optimum.sheet.manifestUnavailable")
    : !manifestSupports
      ? t("versions.optimum.sheet.noBuildForVersion", { version: base })
      : undefined;

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <Box className="text-muted-foreground size-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-xs font-medium" title={version.name}>
            {isOptimum ? base : version.name}
          </span>
          {isOptimum && (
            <Badge
              variant="outline"
              className="border-accent-primary/40 text-accent-primary shrink-0 text-[10px]"
            >
              <Gauge className="size-3" />
              {version.optimum_version
                ? t("versions.optimum.badge", { version: version.optimum_version })
                : t("versions.optimum.label")}
            </Badge>
          )}
          {isRc && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {t("versions.row.releaseCandidate")}
            </Badge>
          )}
          {version.external && (
            <Badge
              variant="outline"
              className="border-accent-primary/40 text-accent-primary shrink-0 gap-1 text-[10px]"
            >
              <Link2 className="size-3" />
              {version.source
                ? t("versions.linkedWithSource", { source: version.source })
                : t("versions.linked")}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {folderMissing ? (
            <span className="text-[var(--color-warning)]">{t("versions.row.folderMissing")}</span>
          ) : (
            version.size_display
          )}
        </p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="text-destructive text-[11px]"
            title={version.external ? t("versions.row.unlinkNote") : t("versions.row.deleteNote")}
          >
            {version.external ? t("versions.row.reallyUnlink") : t("versions.row.reallyDelete")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(false)}
          >
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => removeVersion(version.name)}
          >
            {isPending && <Loader2 className="animate-spin" />}
            {version.external ? t("versions.row.unlink") : t("common.actions.delete")}
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {offerOptimum && (
            <Button
              variant="outline"
              size="sm"
              disabled={!canInstall}
              title={optimumTitle}
              onClick={() => onOptimum(base)}
            >
              <Gauge />
              <span className="hidden sm:inline">{t("versions.optimum.install")}</span>
            </Button>
          )}
          {canUpdate && (
            <Button variant="outline" size="sm" onClick={() => onOptimum(base)}>
              <Gauge />
              <span className="hidden sm:inline">{t("versions.optimum.update")}</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => openFolder(version.path)}>
            <FolderOpen />
            <span className="hidden sm:inline">{t("common.actions.openFolder")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              version.external
                ? t("versions.row.unlinkVersion", { name: version.name })
                : t("versions.row.deleteVersion", { name: version.name })
            }
            title={version.external ? t("versions.row.unlink") : t("common.actions.delete")}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </div>
  );
}
