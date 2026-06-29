import { useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { LoaderCircleIcon, PauseIcon, XIcon } from "lucide-react";
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
  RefreshCwIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";

import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { ViewLogsDialog } from "@/components/dialogs/viewlogs.dialog";
import { InstallationMenu } from "@/components/menus/installation.menu";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { MenuTrigger } from "@/components/ui/menu";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { TooltipTrigger } from "@/components/ui/tooltip";
import {
  rootAlertDialogHandle,
  rootDialogHandle,
  rootMenuHandle,
  rootTooltipHandle,
} from "@/handles";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn, exportInstallation } from "@/lib/utils";
import { useDownloadStore } from "@/stores/downloads";
import { type Installation, useInstallations } from "@/stores/installations";

function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null || bytesPerSec <= 0) return "";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSec;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

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

  // Download store + manager
  const downloadEntry = useDownloadStore((s) => s.entries[installation.version]);
  const { startDownload, resume, pause, cancel } = useDownloadManager();

  // Mutations
  const { mutate: playWithInstallation } = usePlayInstallation();
  const { mutate: openFolder } = useRevealInFolder();

  const isActive =
    downloadEntry && ["downloading", "pending", "extracting"].includes(downloadEntry.status);
  const isPaused = downloadEntry?.status === "paused";
  const isDone = downloadEntry?.status === "done" && !version;
  const isDownloading = downloadEntry?.status === "downloading";
  const percent = downloadEntry?.percent ?? 0;

  const handleClick = () => {
    if (version) {
      playWithInstallation({ id: installation.id });
    } else if (isPaused) {
      resume(installation.version);
    } else if (!isActive && !isDone) {
      startDownload(installation.version);
    }
  };

  const icon = version ? (
    <PlayIcon aria-hidden="true" className="text-success -ms-1 opacity-60" size={16} />
  ) : isActive ? (
    <LoaderCircleIcon
      aria-hidden="true"
      className="text-warning-foreground -ms-1 animate-spin opacity-60"
      size={16}
    />
  ) : isPaused ? (
    <RefreshCwIcon
      aria-hidden="true"
      className="text-warning-foreground -ms-1 opacity-60"
      size={16}
    />
  ) : (
    <DownloadCloudIcon
      aria-hidden="true"
      className="text-warning-foreground -ms-1 opacity-60"
      size={16}
    />
  );

  const tooltip = version
    ? "Launch"
    : isActive
      ? `Downloading ${installation.version}…`
      : isPaused
        ? `Resume download of ${installation.version}`
        : isDone
          ? `Finishing ${installation.version}…`
          : `Download ${installation.version}`;

  return (
    <>
      <div className="flex flex-1 items-center gap-3">
        {installation.icon ? (
          <img
            alt={installation.name}
            className="size-8 shrink-0 object-contain"
            src={`/installation-icons/${installation.icon}`}
          />
        ) : (
          <div className="bg-muted/50 flex size-8 shrink-0 items-center justify-center rounded">
            <PackageSearchIcon aria-hidden="true" className="text-muted-foreground/40 size-4" />
          </div>
        )}
        <TooltipTrigger
          className="flex w-full flex-col justify-start"
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
          {downloadEntry && downloadEntry.status !== "done" ? (
            <div className="flex w-full flex-col gap-1 pr-2">
              <Progress value={Math.round(percent)}>
                <ProgressTrack className="h-2">
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              <span className="text-muted-foreground flex gap-2 text-xs tabular-nums">
                {percent > 0 && <span>{percent.toFixed(1)}%</span>}
                {downloadEntry.speedBps != null && downloadEntry.speedBps > 0 && (
                  <span>{formatSpeed(downloadEntry.speedBps)}</span>
                )}
                {downloadEntry.error && (
                  <span className="text-destructive">{downloadEntry.error}</span>
                )}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground text-left text-xs opacity-60">
              {installation.sizeDisplay ?? "..."}
            </p>
          )}
        </TooltipTrigger>
      </div>
      <Group>
        {isDownloading && (
          <TooltipTrigger
            render={
              <Button
                aria-label="Pause"
                onClick={() => pause(installation.version)}
                size="icon"
                variant="outline"
              >
                <PauseIcon aria-hidden="true" className="opacity-60" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Pause"}
          />
        )}
        {!isActive && (
          <TooltipTrigger
            render={
              <Button disabled={isActive} onClick={handleClick} size="icon" variant="outline">
                {icon}
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => tooltip}
          />
        )}
        {(isActive || isPaused) && (
          <TooltipTrigger
            render={
              <Button
                aria-label="Cancel"
                onClick={() => cancel(installation.version)}
                size="icon"
                variant="outline"
              >
                <XIcon aria-hidden="true" className="opacity-60" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Cancel download"}
          />
        )}
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
                  to: "/installations/$id/mods",
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
                  payload={() => <InstallationDialog installation={installation} />}
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
