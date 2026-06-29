import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { useNavigate } from "@tanstack/react-router";
import {
  DownloadCloudIcon,
  FileTextIcon,
  FileUpIcon,
  FolderOpenIcon,
  FolderPenIcon,
  FolderXIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  PlayIcon,
  StarIcon,
} from "lucide-react";
import * as m from "motion/react-m";

import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { ViewLogsDialog } from "@/components/dialogs/viewlogs.dialog";
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
import { cn, exportInstallation } from "@/lib/utils";
import { type Installation, useInstallations } from "@/stores/installations";

export const InstallationContextMenu = ({
  installation,
  ...props
}: ContextMenuPrimitive.Trigger.Props & {
  installation: Installation;
}) => {
  const navigate = useNavigate();

  // Stores
  const { toggleFavorite } = useInstallations();

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
            {installation.name}
          </ContextMenuLabel>
          {installedVersions?.includes(installation.version) ? (
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
              onClick={() => downloadVersion(installation.version)}
            >
              Download {installation.version}
              <DownloadCloudIcon className="inline-block size-4" />
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() => toggleFavorite(installation.id)}
          >
            {installation.favorite ? "Unfavorite" : "Favorite"}
            <StarIcon
              className={cn(
                "inline-block size-4",
                installation.favorite && "text-warning fill-warning",
              )}
            />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() =>
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
            onClick={() => revealInstallationInFolder(installation.path)}
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
                payload={() => (
                  <ViewLogsDialog
                    installationName={installation.name}
                    installationPath={installation.path}
                  />
                )}
              />
            }
          >
            View Logs
            <FileTextIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex items-center justify-between gap-4"
            onClick={() => exportInstallation({ installation })}
          >
            Export
            <FileUpIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            nativeButton={true}
            render={
              <DialogTrigger
                nativeButton={true}
                handle={rootDialogHandle}
                payload={() => <InstallationDialog installation={installation} />}
              />
            }
          >
            Edit
            <FolderPenIcon className="inline-block size-4" />
          </ContextMenuItem>
          <ContextMenuItem
            className="flex w-full items-center justify-between gap-4"
            variant="destructive"
            nativeButton={true}
            render={
              <AlertDialogTrigger
                nativeButton={true}
                handle={rootAlertDialogHandle}
                payload={() => <DeleteInstallationDialog installation={installation} />}
              />
            }
          >
            Delete
            <FolderXIcon className="inline-block size-4" />
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const MotionInstallationContextMenu = m.create(InstallationContextMenu);
