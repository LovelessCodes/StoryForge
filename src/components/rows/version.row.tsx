import { FolderOpenIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppFolder } from "@/hooks/use-app-folder";
import type { InstalledVersion } from "@/hooks/use-installed-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useSettingsStore } from "@/stores/settings";

export function VersionRow({ version }: { version: InstalledVersion }) {
  const { appFolder } = useAppFolder();

  // Stores
  const { openDialog } = useDialogStore();
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
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
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
                  />
                }
              >
                <FolderOpenIcon aria-hidden="true" className="opacity-60" size={16} />
              </GroupItem>
            }
          />
          <TooltipContent>Open Folder</TooltipContent>
        </Tooltip>
        <GroupSeparator />
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    aria-label="Delete"
                    onClick={() => openDialog("DeleteVersionDialog", { version: version.name })}
                    size="icon"
                    variant="outline"
                  />
                }
              >
                <TrashIcon aria-hidden="true" className="opacity-60" size={16} />
              </GroupItem>
            }
          />
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </Group>
    </>
  );
}
