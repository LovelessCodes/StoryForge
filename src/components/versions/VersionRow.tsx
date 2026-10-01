import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Box, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedVersionsQueryKey, type InstalledVersion } from "@/hooks/use-installed-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { buildVersionPath } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import { useSettingsStore } from "@/stores/settings";

const deleteNote =
  "Profiles using this version keep working; you just cannot create new ones with it " +
  "until it is reinstalled.";

export default function VersionRow({ version }: { version: InstalledVersion }) {
  const { appFolder } = useAppFolder();
  const { versionsParent, versionsSubdir } = useSettingsStore();
  const { mutate: openFolder } = useRevealInFolder();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const { mutate: removeVersion, isPending } = useMutation({
    mutationFn: (name: string) => invoke("remove_installed_version", { version: name }),
    onMutate: () => {
      toast.loading(`Deleting version ${version.name}…`, {
        id: `version-delete-${version.name}`,
      });
    },
    onSuccess: () => {
      toast.success(`Version ${version.name} deleted`, {
        id: `version-delete-${version.name}`,
      });
      void queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
    },
    onError: (error) => {
      toast.error(`Failed to delete version ${version.name}: ${error.message}`, {
        id: `version-delete-${version.name}`,
      });
    },
  });

  const versionRoot = versionsParent ?? appFolder;
  const isRc = version.name.includes("rc");

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <Box className="text-muted-foreground size-4 shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-medium">{version.name}</span>
          {isRc && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Release Candidate
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{version.size_display}</p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-destructive text-[11px]" title={deleteNote}>
            Really delete?
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => removeVersion(version.name)}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!versionRoot}
            onClick={() =>
              versionRoot && openFolder(buildVersionPath(versionRoot, version.name, versionsSubdir))
            }
          >
            <FolderOpen />
            <span className="hidden sm:inline">Open Folder</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete version ${version.name}`}
            title="Delete"
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
