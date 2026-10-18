import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  installedVersionsQueryKey,
  useInstalledVersions,
  type InstalledVersion,
} from "@/hooks/use-installed-versions";
import { linkableVersionsQueryKey } from "@/hooks/use-linkable-versions";
import { useOptimumStatus } from "@/hooks/use-optimum";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { useVulkanStoryStatus } from "@/hooks/use-vulkanstory";
import { toast } from "@/lib/notify";

import { VersionActions } from "./VersionActions";
import { VersionIdentity } from "./VersionIdentity";

/** The inline confirmation that replaces a row's action buttons while deleting. */
function VersionRemoveConfirm({
  version,
  isPending,
  onCancel,
  onConfirm,
}: {
  version: InstalledVersion;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className="text-destructive text-[11px]"
        title={version.external ? t("versions.row.unlinkNote") : t("versions.row.deleteNote")}
      >
        {version.external ? t("versions.row.reallyUnlink") : t("versions.row.reallyDelete")}
      </span>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={onCancel}>
        {t("common.actions.cancel")}
      </Button>
      <Button variant="destructive" size="sm" disabled={isPending} onClick={onConfirm}>
        {isPending && <Loader2 className="animate-spin" />}
        {version.external ? t("versions.row.unlink") : t("common.actions.delete")}
      </Button>
    </div>
  );
}

export default function VersionRow({
  version,
  onOptimum,
  onVulkanStory,
}: {
  version: InstalledVersion;
  onOptimum: (baseVersion: string) => void;
  onVulkanStory: (baseVersion: string) => void;
}) {
  const { t } = useTranslation();
  const { mutate: openFolder } = useRevealInFolder();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { data: optimumStatus } = useOptimumStatus();
  const { data: vulkanStoryStatus } = useVulkanStoryStatus();
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

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <VersionIdentity version={version} />

      {confirming ? (
        <VersionRemoveConfirm
          version={version}
          isPending={isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => removeVersion(version.name)}
        />
      ) : (
        <VersionActions
          version={version}
          versions={versions}
          optimumStatus={optimumStatus}
          vulkanStoryStatus={vulkanStoryStatus}
          isPending={isPending}
          onOpenFolder={() => openFolder(version.path)}
          onStartRemove={() => setConfirming(true)}
          onOptimum={onOptimum}
          onVulkanStory={onVulkanStory}
        />
      )}
    </div>
  );
}
