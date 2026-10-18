import { Box, Gauge, Link2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { type InstalledVersion } from "@/hooks/use-installed-versions";
import { baseGameVersion, isOptimumVersion, isVulkanStoryVersion } from "@/lib/helpers";

/** The fork, release-candidate and linked badges shown next to a version name. */
function VersionBadges({ version }: { version: InstalledVersion }) {
  const { t } = useTranslation();
  const isOptimum = isOptimumVersion(version.name);
  const isVulkanStory = isVulkanStoryVersion(version.name);
  const isRc = version.name.includes("rc");

  return (
    <>
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
      {isVulkanStory && (
        <Badge
          variant="outline"
          className="border-accent-primary/40 text-accent-primary shrink-0 text-[10px]"
        >
          <Sparkles className="size-3" />
          {version.vulkanstory_version
            ? t("versions.vulkanstory.badge", { version: version.vulkanstory_version })
            : t("versions.vulkanstory.label")}
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
    </>
  );
}

/** The icon, name, badges and size line at the start of a version row. */
export function VersionIdentity({ version }: { version: InstalledVersion }) {
  const { t } = useTranslation();
  const isOptimum = isOptimumVersion(version.name);
  const isVulkanStory = isVulkanStoryVersion(version.name);
  const base = baseGameVersion(version.name);
  const folderMissing = version.external && version.size_bytes === 0;

  return (
    <>
      <Box className="text-muted-foreground size-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-xs font-medium" title={version.name}>
            {isOptimum || isVulkanStory ? base : version.name}
          </span>
          <VersionBadges version={version} />
        </div>
        <p className="text-muted-foreground text-xs">
          {folderMissing ? (
            <span className="text-[var(--color-warning)]">{t("versions.row.folderMissing")}</span>
          ) : (
            version.size_display
          )}
        </p>
      </div>
    </>
  );
}
