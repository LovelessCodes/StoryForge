import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Box, FolderOpen, Link2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { installedVersionsQueryKey, type InstalledVersion } from "@/hooks/use-installed-versions";
import { linkableVersionsQueryKey } from "@/hooks/use-linkable-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { toast } from "@/lib/notify";

export default function VersionRow({ version }: { version: InstalledVersion }) {
  const { t } = useTranslation();
  const { mutate: openFolder } = useRevealInFolder();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

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

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <Box className="text-muted-foreground size-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-xs font-medium">{version.name}</span>
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
