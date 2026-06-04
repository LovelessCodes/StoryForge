import { useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  DownloadCloudIcon,
  EllipsisIcon,
  FileTextIcon,
  FileUpIcon,
  FolderOpenIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  PencilIcon,
  PlayIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";

import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { EditInstallationDialog } from "@/components/dialogs/editinstallation.dialog";
import { ViewLogsDialog } from "@/components/dialogs/viewlogs.dialog";
import { InstallationMenu } from "@/components/menus/installation.menu";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { MenuTrigger } from "@/components/ui/menu";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn, exportInstallation } from "@/lib/utils";
import {
  rootAlertDialogHandle,
  rootDialogHandle,
  rootMenuHandle,
  rootTooltipHandle,
} from "@/routes/__root";
import { type Installation, useInstallations } from "@/stores/installations";

export type InstallationRowProps = {
  installation: Installation;
};

export function InstallationRow({ installation }: InstallationRowProps) {
  const router = useRouter();

  // Stores
  const { toggleFavorite } = useInstallations();

  // Queries
  const versions = useInstalledVersionNames();
  const version = versions?.find((v) => v === installation.version);

  // Mutations
  const { mutate: downloadVersion, isPending: isInstalling } = useDownloadVersion();
  const { mutate: playWithInstallation } = usePlayInstallation();
  const { mutate: openFolder } = useRevealInFolder();

  return (
    <>
      <div className="flex flex-1 items-center gap-3">
        <TooltipTrigger
          className="flex flex-col justify-start"
          handle={rootTooltipHandle}
          payload={() => (
            <>
              Last played:{" "}
              {installation.lastTimePlayed
                ? formatDistanceToNow(new Date(installation.lastTimePlayed), {
                    addSuffix: true,
                  })
                : "Never"}
            </>
          )}
        >
          <p className="text-foreground text-left text-sm">{installation.name}</p>
          {installation.version && (
            <p className="text-muted-foreground text-left text-xs">v{installation.version}</p>
          )}
          <p className="text-muted-foreground text-left text-xs opacity-60">
            {installation.sizeDisplay ?? "..."}
          </p>
        </TooltipTrigger>
      </div>
      <Group>
        <TooltipTrigger
          render={
            <Button
              disabled={isInstalling}
              onClick={() =>
                version
                  ? playWithInstallation({
                      id: installation.id,
                    })
                  : downloadVersion(installation.version)
              }
              size="icon"
              variant="outline"
            >
              {version ? (
                <PlayIcon aria-hidden="true" className="text-success -ms-1 opacity-60" size={16} />
              ) : (
                <DownloadCloudIcon
                  aria-hidden="true"
                  className="text-warning-foreground -ms-1 opacity-60"
                  size={16}
                />
              )}
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (version ? "Launch" : `Download ${installation.version}`)}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button onClick={() => toggleFavorite(installation.id)} size="icon" variant="outline">
              <StarIcon
                aria-hidden="true"
                className={cn(
                  "-ms-1",
                  installation.favorite ? "fill-warning text-warning opacity-100" : "opacity-60",
                )}
                size={16}
              />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (installation.favorite ? "Unfavorite" : "Favorite")}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              onClick={() =>
                router.navigate({
                  params: { id: installation.id.toString() },
                  to: "/install-mods/$id",
                })
              }
              size="icon"
              variant="outline"
            >
              <PackageSearchIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Manage Mods"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              onClick={() =>
                router.navigate({
                  params: { id: installation.id.toString() },
                  to: "/mod-configs/$id",
                })
              }
              size="icon"
              variant="outline"
            >
              <PackageOpenIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Open Mod Configs"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              aria-label="Open folder"
              onClick={() => openFolder(installation.path)}
              size="icon"
              variant="outline"
            >
              <FolderOpenIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Open Folder"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              aria-label="View logs"
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
              size="icon"
              variant="outline"
            >
              <FileTextIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "View Logs"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              onClick={() => exportInstallation({ installation })}
              size="icon"
              variant="outline"
            >
              <FileUpIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Export"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <EditInstallationDialog installation={installation} />}
                />
              }
              size="icon"
              variant="outline"
            >
              <PencilIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Edit"}
        />
        <GroupSeparator className="max-md:hidden" />
        <TooltipTrigger
          className="max-md:hidden"
          render={
            <Button
              aria-label="Delete"
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => <DeleteInstallationDialog installation={installation} />}
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
        <GroupSeparator className="md:hidden" />
        <TooltipTrigger
          className="md:hidden"
          render={
            <Button
              aria-label="More Actions"
              render={
                <MenuTrigger
                  handle={rootMenuHandle}
                  payload={() => <InstallationMenu installation={installation} />}
                />
              }
              size="icon"
              variant="outline"
            >
              <EllipsisIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "More Actions"}
        />
      </Group>
    </>
  );
}
