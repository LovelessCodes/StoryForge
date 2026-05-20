import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadCloudIcon,
  FolderOpenIcon,
  FolderXIcon,
  MapIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  PencilIcon,
  PlayIcon,
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
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import type { World } from "@/lib/types";
import { rootAlertDialogHandle, rootDialogHandle } from "@/routes/__root";
import { useInstallations } from "@/stores/installations";

import { DeleteWorldDialog } from "../dialogs/deleteworld.dialog";
import { EditWorldDialog } from "../dialogs/editworld.dialog";
import { ViewMapDialog } from "../dialogs/viewmap.dialog";
import { AlertDialogTrigger } from "../ui/alert-dialog";
import { DialogTrigger } from "../ui/dialog";

export const WorldContextMenu = ({
  world,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  world: World;
}) => {
  const navigate = useNavigate();

  // Stores
  const { installations } = useInstallations();
  const installation = installations.find(
    (installation) => installation.path.split("/").pop() === world.installation_name,
  );

  // Mutations
  const { mutate: revealInstallationInFolder } = useRevealInFolder();
  const { mutate: launchInstallation } = usePlayInstallation();
  const { mutate: downloadVersion } = useDownloadVersion();

  // Queries
  const installedVersions = useInstalledVersionNames();

  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel className="text-muted-foreground/50 border-b text-xs font-semibold">
            {world.data.world_name}
          </ContextMenuLabel>
          {installation && installedVersions?.includes(installation.version) ? (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => launchInstallation({ id: installation.id })}
            >
              Launch
              <PlayIcon className="inline-block h-4 w-4" />
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
            className="flex w-full items-center justify-between gap-4"
            disabled={!world.has_map}
            nativeButton
            render={
              <DialogTrigger
                handle={rootDialogHandle}
                payload={() => <ViewMapDialog world={world} />}
              />
            }
          >
            View Map
            <MapIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
              installation &&
              navigate({
                params: { id: installation.id.toString() },
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
            Open Folder
            <FolderOpenIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton
            render={
              <DialogTrigger
                handle={rootDialogHandle}
                payload={() => <EditWorldDialog world={world} />}
              />
            }
          >
            Edit
            <PencilIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton
            render={
              <AlertDialogTrigger
                handle={rootAlertDialogHandle}
                payload={() => <DeleteWorldDialog world={world} />}
              />
            }
            variant="destructive"
          >
            Delete
            <FolderXIcon className="inline-block h-4 w-4" />
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionWorldContextMenu = motion.create(WorldContextMenu);
