import { FolderOpen, Gauge, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { type InstalledVersion } from "@/hooks/use-installed-versions";
import { type OptimumStatus } from "@/hooks/use-optimum";
import { type VulkanStoryStatus } from "@/hooks/use-vulkanstory";
import {
  baseGameVersion,
  compareSemverDesc,
  isOptimumVersion,
  isVulkanStoryVersion,
  optimumVersionName,
  vulkanStoryVersionName,
} from "@/lib/helpers";

/** The part of a fork's status a row needs to decide what to offer. */
type ForkManifest = { supportedGameVersions: string[] };

/** Reads the fork's manifest and whether the newest build covers this game version. */
function getForkManifest<M extends ForkManifest>(
  status: { manifest: M | null } | undefined,
  base: string,
): { manifest: M | null; supports: boolean } {
  const manifest = status?.manifest ?? null;
  const supports = !!manifest && manifest.supportedGameVersions.includes(base);
  return { manifest, supports };
}

/** Why a fork's install button is disabled, if it is. */
function forkInstallTitle(
  manifest: ForkManifest | null,
  supports: boolean,
  labels: { noBuild: string; unavailable: string },
): string | undefined {
  if (!manifest) return labels.unavailable;
  if (!supports) return labels.noBuild;
  return undefined;
}

/** Whether a vanilla row shows a fork install button (it may still be disabled). */
function offersForkInstall({
  isVanilla,
  buildExists,
  platformSupported,
  folderMissing,
}: {
  isVanilla: boolean;
  buildExists: boolean;
  platformSupported: boolean;
  folderMissing: boolean;
}) {
  return isVanilla && !buildExists && platformSupported && !folderMissing;
}

/**
 * A vanilla row's Optimum install button, or an Optimum row's update button.
 *
 * A vanilla row offers the install whenever the platform has a build, enabled
 * only when the newest published overlay supports this game version; an Optimum
 * row updates when the newest overlay supports its base version and is newer
 * than the installed one.
 */
function OptimumActions({
  version,
  versions,
  status,
  onInstall,
}: {
  version: InstalledVersion;
  versions: InstalledVersion[] | undefined;
  status: OptimumStatus | undefined;
  onInstall: (baseVersion: string) => void;
}) {
  const { t } = useTranslation();
  const base = baseGameVersion(version.name);
  const build = (versions ?? []).find((v) => v.name === optimumVersionName(base));
  const { manifest, supports } = getForkManifest(status, base);
  const offersInstall = offersForkInstall({
    isVanilla: version.name === base,
    buildExists: !!build,
    platformSupported: !!status?.platformSupported,
    folderMissing: version.external && version.size_bytes === 0,
  });
  const canUpdate =
    isOptimumVersion(version.name) &&
    !!manifest &&
    supports &&
    compareSemverDesc(manifest.optimumVersion, version.optimum_version ?? "0") < 0;
  const title = forkInstallTitle(manifest, supports, {
    noBuild: t("versions.optimum.sheet.noBuildForVersion", { version: base }),
    unavailable: t("versions.optimum.sheet.manifestUnavailable"),
  });

  return (
    <>
      {offersInstall && (
        <Button
          variant="outline"
          size="sm"
          disabled={!supports}
          title={title}
          onClick={() => onInstall(base)}
        >
          <Gauge />
          <span className="hidden sm:inline">{t("versions.optimum.install")}</span>
        </Button>
      )}
      {canUpdate && (
        <Button variant="outline" size="sm" onClick={() => onInstall(base)}>
          <Gauge />
          <span className="hidden sm:inline">{t("versions.optimum.update")}</span>
        </Button>
      )}
    </>
  );
}

/**
 * A vanilla row's VulkanStory install button, or a VulkanStory row's update
 * button. The rules mirror Optimum: install when the platform has a package and
 * none exists for this version, update when the newest release supports the
 * installed build's base version and is newer.
 */
function VulkanStoryActions({
  version,
  versions,
  status,
  onInstall,
}: {
  version: InstalledVersion;
  versions: InstalledVersion[] | undefined;
  status: VulkanStoryStatus | undefined;
  onInstall: (baseVersion: string) => void;
}) {
  const { t } = useTranslation();
  const base = baseGameVersion(version.name);
  const build = (versions ?? []).find((v) => v.name === vulkanStoryVersionName(base));
  const { manifest, supports } = getForkManifest(status, base);
  const offersInstall = offersForkInstall({
    isVanilla: version.name === base,
    buildExists: !!build,
    platformSupported: !!status?.platformSupported,
    folderMissing: version.external && version.size_bytes === 0,
  });
  const canUpdate =
    isVulkanStoryVersion(version.name) &&
    !!version.vulkanstory_version &&
    !!manifest &&
    supports &&
    compareSemverDesc(manifest.vulkanstoryVersion, version.vulkanstory_version) < 0;
  const title = forkInstallTitle(manifest, supports, {
    noBuild: t("versions.vulkanstory.sheet.noBuildForVersion", { version: base }),
    unavailable: t("versions.vulkanstory.sheet.manifestUnavailable"),
  });

  return (
    <>
      {offersInstall && (
        <Button
          variant="outline"
          size="sm"
          disabled={!supports}
          title={title}
          onClick={() => onInstall(base)}
        >
          <Sparkles />
          <span className="hidden sm:inline">{t("versions.vulkanstory.install")}</span>
        </Button>
      )}
      {canUpdate && (
        <Button variant="outline" size="sm" onClick={() => onInstall(base)}>
          <Sparkles />
          <span className="hidden sm:inline">{t("versions.vulkanstory.update")}</span>
        </Button>
      )}
    </>
  );
}

/** A row's action buttons: fork installs/updates, open folder and start delete. */
export function VersionActions({
  version,
  versions,
  optimumStatus,
  vulkanStoryStatus,
  isPending,
  onOpenFolder,
  onStartRemove,
  onOptimum,
  onVulkanStory,
}: {
  version: InstalledVersion;
  versions: InstalledVersion[] | undefined;
  optimumStatus: OptimumStatus | undefined;
  vulkanStoryStatus: VulkanStoryStatus | undefined;
  isPending: boolean;
  onOpenFolder: () => void;
  onStartRemove: () => void;
  onOptimum: (baseVersion: string) => void;
  onVulkanStory: (baseVersion: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <OptimumActions
        version={version}
        versions={versions}
        status={optimumStatus}
        onInstall={onOptimum}
      />
      <VulkanStoryActions
        version={version}
        versions={versions}
        status={vulkanStoryStatus}
        onInstall={onVulkanStory}
      />
      <Button variant="outline" size="sm" onClick={onOpenFolder}>
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
        onClick={onStartRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
