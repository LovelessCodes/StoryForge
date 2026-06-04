import { FolderOpenIcon, TrashIcon } from "lucide-react";

import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootAlertDialogHandle, rootTooltipHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import type { InstalledVersion } from "@/hooks/use-installed-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

export function VersionRow({ version }: { version: InstalledVersion }) {
  const { appFolder } = useAppFolder();

  // Stores
  const { versionsParent, versionsSubdir } = useSettingsStore();

  // Mutations
  const { mutate: openFolder } = useRevealInFolder();

  return (
    <>
      <span className="flex flex-1 flex-col text-sm">
        <span>
          {version.name}
          {version.name.includes("rc") && (
            <span className="text-muted-foreground ml-2 text-xs opacity-50">
              (Release Candidate)
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-xs opacity-60">{version.size_display}</span>
      </span>
      <Group>
        <TooltipTrigger
          render={
            <Button
              aria-label="Open Folder"
              onClick={() =>
                openFolder(
                  `${versionsParent ?? appFolder}${pathDelimiter}${versionsSubdir}${pathDelimiter}${version.name}`,
                )
              }
              size="icon"
              variant="outline"
            >
              <FolderOpenIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Open Folder"}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              aria-label="Delete"
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => <DeleteVersionDialog version={version.name} />}
                />
              }
              size="icon"
              variant="outline"
            >
              <TrashIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Delete"}
        />
      </Group>
    </>
  );
}
