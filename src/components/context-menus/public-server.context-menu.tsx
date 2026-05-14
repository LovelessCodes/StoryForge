import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { DownloadCloudIcon, FolderPlusIcon, PlugIcon } from "lucide-react";
import { motion } from "motion/react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";

export const PublicServerContextMenu = ({
  server,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  server: PublicServer;
}) => {
  // Stores
  const { openDialog } = useDialogStore();
  const { installations } = useInstallations();

  // Queries
  const installedVersions = useInstalledVersionNames();

  // Mutations
  const { mutate: downloadVersion } = useDownloadVersion();

  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel className="text-muted-foreground/50 border-b text-xs font-semibold">
            {server.serverName}
          </ContextMenuLabel>
          {installedVersions?.includes(server.gameVersion) ? (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => openDialog("ConnectServerDialog", { server })}
            >
              Connect
              <PlugIcon className="inline-block h-4 w-4" />
            </ContextMenuItem>
          ) : installations.find((i) => i.version === server.gameVersion) ? (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => downloadVersion(server.gameVersion)}
            >
              Download {server.gameVersion}
              <DownloadCloudIcon className="inline-block h-4 w-4" />
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() =>
                server &&
                openDialog("AddInstallationDialog", {
                  version: server.gameVersion,
                })
              }
            >
              Add Installation
              <FolderPlusIcon className="inline-block h-4 w-4" />
            </ContextMenuItem>
          )}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionPublicServerContextMenu = motion.create(PublicServerContextMenu);
