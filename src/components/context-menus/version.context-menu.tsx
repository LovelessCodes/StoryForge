import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { FolderOpenIcon, TrashIcon } from "lucide-react";
import * as m from "motion/react-m";

import { DeleteVersionDialog } from "@/components/dialogs/deleteversion.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { rootAlertDialogHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { pathDelimiter } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";

export const VersionContextMenu = ({
  version,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  version: string;
}) => {
  const { appFolder } = useAppFolder();

  // Stores
  const { versionsParent, versionsSubdir } = useSettingsStore();

  // Mutations
  const { mutate: openFolder } = useRevealInFolder();

  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel className="text-muted-foreground/50 border-b text-xs font-semibold">
            {version}
          </ContextMenuLabel>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
              openFolder(
                `${versionsParent ?? appFolder}${pathDelimiter}${versionsSubdir}${pathDelimiter}${version}`,
              )
            }
          >
            Open Folder
            <FolderOpenIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton
            render={
              <AlertDialogTrigger
                handle={rootAlertDialogHandle}
                payload={() => <DeleteVersionDialog version={version} />}
              />
            }
            variant="destructive"
          >
            Delete
            <TrashIcon className="inline-block size-4" />
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionVersionContextMenu = m.create(VersionContextMenu);
