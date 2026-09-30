import { useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  DownloadCloudIcon,
  EllipsisIcon,
  FileTextIcon,
  FileUpIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PackageOpenIcon,
  PackageSearchIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  StarIcon,
  TrashIcon,
  XIcon,
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
  const versions = useInstalledVersionNames();
  const version = versions?.find((v) => v === installation.version);

  const downloadEntry = useDownloadStore((s) => s.entries[installation.version]);
  const { startDownload, resume, pause, cancel } = useDownloadManager();
  const { mutate: playWithInstallation } = usePlayInstallation();

  const isActive = Boolean(
    downloadEntry && ["downloading", "pending", "extracting"].includes(downloadEntry.status),
  );
  const isPaused = downloadEntry?.status === "paused";
  const isDone = downloadEntry?.status === "done" && !version;
  const isDownloading = downloadEntry?.status === "downloading";
  const percent = downloadEntry?.percent ?? 0;

  const handlePrimaryAction = () => {
    if (version) {
      playWithInstallation({ id: installation.id });
    } else if (isPaused) {
      resume(installation.version);
    } else if (!isActive && !isDone) {
      startDownload(installation.version);
    }
  };

  return (
    <>
      <InstallationRowIdentity
        error={downloadEntry?.error}
        installation={installation}
        percent={percent}
        showProgress={Boolean(downloadEntry && downloadEntry.status !== "done")}
        speedBps={downloadEntry?.speedBps}
      />
      <InstallationRowActions
        installation={installation}
        isActive={isActive}
        isDone={isDone}
        isDownloading={isDownloading}
        isPaused={isPaused}
        onCancel={() => cancel(installation.version)}
        onPause={() => pause(installation.version)}
        onPrimaryAction={handlePrimaryAction}
        version={version}
      />
    </>
  );
}

/** Icon, name, version and download progress of one installation. */
function InstallationRowIdentity({
  error,
  installation,
  percent,
  showProgress,
  speedBps,
}: {
  error: string | null | undefined;
  installation: Installation;
  percent: number;
  showProgress: boolean;
  speedBps: number | null | undefined;
}) {
  return (
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
              ? formatDistanceToNow(new Date(installation.lastTimePlayed), { addSuffix: true })
              : "Never"}
          </>
        )}
      >
        <p className="text-foreground text-left text-sm">{installation.name}</p>
        {installation.version && (
          <p className="text-muted-foreground text-left text-xs">v{installation.version}</p>
        )}
        {showProgress ? (
          <div className="flex w-full flex-col gap-1 pr-2">
            <Progress value={Math.round(percent)}>
              <ProgressTrack className="h-2">
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
            <span className="text-muted-foreground flex gap-2 text-xs tabular-nums">
              {percent > 0 && <span>{percent.toFixed(1)}%</span>}
              {speedBps != null && speedBps > 0 && <span>{formatSpeed(speedBps)}</span>}
              {error && <span className="text-destructive">{error}</span>}
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-left text-xs opacity-60">
            {installation.sizeDisplay ?? "..."}
          </p>
        )}
      </TooltipTrigger>
    </div>
  );
}

function InstallationRowActions({
  installation,
  isActive,
  isDone,
  isDownloading,
  isPaused,
  onCancel,
  onPause,
  onPrimaryAction,
  version,
}: {
  installation: Installation;
  isActive: boolean;
  isDone: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onPause: () => void;
  onPrimaryAction: () => void;
  version: string | undefined;
}) {
  return (
    <Group>
      <DownloadControls
        installationVersion={installation.version}
        isActive={isActive}
        isDone={isDone}
        isDownloading={isDownloading}
        isPaused={isPaused}
        onCancel={onCancel}
        onPause={onPause}
        onPrimaryAction={onPrimaryAction}
        version={version}
      />
      <GroupSeparator className="max-md:hidden" />
      <InstallationActionButtons installation={installation} />
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
  );
}

/** Pause / play / cancel depending on the download state. */
function DownloadControls({
  installationVersion,
  isActive,
  isDone,
  isDownloading,
  isPaused,
  onCancel,
  onPause,
  onPrimaryAction,
  version,
}: {
  installationVersion: string;
  isActive: boolean;
  isDone: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onPause: () => void;
  onPrimaryAction: () => void;
  version: string | undefined;
}) {
  const tooltip = downloadTooltip(installationVersion, {
    hasVersion: Boolean(version),
    isActive,
    isDone,
    isPaused,
  });
  const actionState = primaryActionState(version, isDownloading, isPaused);

  return (
    <>
      {isDownloading && (
        <TooltipTrigger
          render={
            <Button aria-label="Pause" onClick={onPause} size="icon" variant="outline">
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
            <Button disabled={isActive} onClick={onPrimaryAction} size="icon" variant="outline">
              <PrimaryActionIcon state={actionState} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => tooltip}
        />
      )}
      {(isActive || isPaused) && (
        <TooltipTrigger
          render={
            <Button aria-label="Cancel" onClick={onCancel} size="icon" variant="outline">
              <XIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Cancel download"}
        />
      )}
    </>
  );
}

/** Tooltip text for the primary download button. */
function downloadTooltip(
  installationVersion: string,
  {
    hasVersion,
    isActive,
    isDone,
    isPaused,
  }: {
    hasVersion: boolean;
    isActive: boolean;
    isDone: boolean;
    isPaused: boolean;
  },
): string {
  if (hasVersion) return "Launch";
  if (isActive) return `Downloading ${installationVersion}…`;
  if (isPaused) return `Resume download of ${installationVersion}`;
  if (isDone) return `Finishing ${installationVersion}…`;
  return `Download ${installationVersion}`;
}

/** Which icon the primary button shows for the current download state. */
function primaryActionState(
  version: string | undefined,
  isDownloading: boolean,
  isPaused: boolean,
): "launch" | "downloading" | "paused" | "download" {
  if (version) return "launch";
  if (isDownloading) return "downloading";
  if (isPaused) return "paused";
  return "download";
}

function PrimaryActionIcon({ state }: { state: "launch" | "downloading" | "paused" | "download" }) {
  if (state === "launch") {
    return <PlayIcon aria-hidden="true" className="text-success -ms-1 opacity-60" size={16} />;
  }
  if (state === "downloading") {
    return (
      <LoaderCircleIcon
        aria-hidden="true"
        className="text-warning-foreground -ms-1 animate-spin opacity-60"
        size={16}
      />
    );
  }
  if (state === "paused") {
    return (
      <RefreshCwIcon
        aria-hidden="true"
        className="text-warning-foreground -ms-1 opacity-60"
        size={16}
      />
    );
  }
  return (
    <DownloadCloudIcon
      aria-hidden="true"
      className="text-warning-foreground -ms-1 opacity-60"
      size={16}
    />
  );
}

/** Secondary row actions: favorite, mods, configs, folder, logs, export, edit, delete. */
function InstallationActionButtons({ installation }: { installation: Installation }) {
  const router = useRouter();
  const { toggleFavorite } = useInstallations();
  const { mutate: openFolder } = useRevealInFolder();

  return (
    <>
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
    </>
  );
}
