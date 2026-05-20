import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadCloudIcon,
  FolderOpenIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  PenIcon,
  PlugIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { motion } from "motion/react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn } from "@/lib/utils";
import { rootAlertDialogHandle, rootDialogHandle } from "@/routes/__root";
import { useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

import { DeleteServerDialog } from "../dialogs/deleteserver.dialog";
import { EditServerDialog } from "../dialogs/editserver.dialog";
import { AlertDialogTrigger } from "../ui/alert-dialog";
import { DialogTrigger } from "../ui/dialog";

export const ServerContextMenu = ({
  server,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  server: Server;
}) => {
  const navigate = useNavigate();

  // Stores
  const { toggleFavorite } = useServerStore();
  const { installations } = useInstallations();
  const installation = installations.find((inst) => inst.id === server.installationId);

  // Mutations
  const { mutate: revealInstallationInFolder } = useRevealInFolder();
  const { mutate: connectToServer } = useConnectToServer();
  const { mutate: downloadVersion } = useDownloadVersion();

  // Queries
  const installedVersions = useInstalledVersionNames();

  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel className="text-muted-foreground/50 border-b text-xs font-semibold">
            {server.name}
          </ContextMenuLabel>
          {installation && installedVersions?.includes(installation.version) ? (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => connectToServer(server)}
            >
              Connect
              <PlugIcon className="inline-block h-4 w-4" />
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => installation && downloadVersion(installation.version)}
            >
              Download {installation?.version}
              <DownloadCloudIcon className="inline-block h-4 w-4" />
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() => toggleFavorite(server.id)}
          >
            {server.favorite ? "Unfavorite" : "Favorite"}
            <StarIcon
              className={cn("inline-block h-4 w-4", server.favorite && "text-warning fill-warning")}
            />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
              installation &&
              navigate({
                params: { id: installation?.id.toString() },
                to: "/install-mods/$id",
              })
            }
          >
            Manage Mods
            <PackageSearchIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
              installation &&
              navigate({
                params: { id: installation.id.toString() },
                to: "/mod-configs/$id",
              })
            }
          >
            Configure Mods
            <PackageOpenIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() => installation && revealInstallationInFolder(installation.path)}
          >
            Open Installation Folder
            <FolderOpenIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton
            render={
              <DialogTrigger
                handle={rootDialogHandle}
                payload={() => <EditServerDialog server={server} />}
              />
            }
          >
            Edit
            <PenIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton
            render={
              <AlertDialogTrigger
                handle={rootAlertDialogHandle}
                payload={() => <DeleteServerDialog server={server} />}
              />
            }
            variant="destructive"
          >
            Delete
            <TrashIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionServerContextMenu = motion.create(ServerContextMenu);
