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
import * as m from "motion/react-m";

import { DeleteWorldDialog } from "@/components/dialogs/deleteworld.dialog";
import { EditWorldDialog } from "@/components/dialogs/editworld.dialog";
import { ViewMapDialog } from "@/components/dialogs/viewmap.dialog";
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
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import type { World } from "@/lib/types";
import { useInstallations } from "@/stores/installations";

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
              <PlayIcon className="inline-block size-4" />
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              className="flex items-center justify-between gap-4"
              onClick={() => installation && downloadVersion(installation.version)}
            >
              Download {installation?.version}
              <DownloadCloudIcon className="inline-block size-4" />
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
            <MapIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
              installation &&
              navigate({
                params: { id: installation.id.toString() },
                to: "/installations/$id/mods",
              })
            }
          >
            Manage Mods
            <PackageSearchIcon className="inline-block size-4" />
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
            <PackageOpenIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() => installation && revealInstallationInFolder(installation.path)}
          >
            Open Folder
            <FolderOpenIcon className="inline-block size-4" />
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
            <PencilIcon className="inline-block size-4" />
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
            <FolderXIcon className="inline-block size-4" />
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionWorldContextMenu = m.create(WorldContextMenu);
