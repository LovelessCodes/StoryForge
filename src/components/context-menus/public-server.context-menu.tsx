import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { DownloadCloudIcon, FolderPlusIcon, PlugIcon } from "lucide-react";
import * as m from "motion/react-m";

import { ConnectServerDialog } from "@/components/dialogs/connectserver.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DialogTrigger } from "@/components/ui/dialog";
import { rootAlertDialogHandle, rootDialogHandle } from "@/handles";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { PublicServer } from "@/hooks/use-public-servers";
import { useInstallations } from "@/stores/installations";

export const PublicServerContextMenu = ({
  server,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  server: PublicServer;
}) => {
  // Stores
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
              className="flex w-full items-center justify-between gap-4"
              nativeButton
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => <ConnectServerDialog server={server} />}
                />
              }
            >
              Connect
              <PlugIcon className="inline-block size-4" />
            </ContextMenuItem>
          ) : installations.find((i) => i.version === server.gameVersion) ? (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => downloadVersion(server.gameVersion)}
            >
              Download {server.gameVersion}
              <DownloadCloudIcon className="inline-block size-4" />
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              className="flex w-full items-center justify-between gap-4"
              nativeButton
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <InstallationDialog version={server.gameVersion} />}
                />
              }
            >
              Add Installation
              <FolderPlusIcon className="inline-block size-4" />
            </ContextMenuItem>
          )}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionPublicServerContextMenu = m.create(PublicServerContextMenu);
