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

import { DeleteInstallationDialog } from "@/components/dialogs/deleteinstallation.dialog";
import { InstallationDialog } from "@/components/dialogs/installation.dialog";
import { ViewLogsDialog } from "@/components/dialogs/viewlogs.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DialogTrigger } from "@/components/ui/dialog";
import { rootAlertDialogHandle, rootDialogHandle } from "@/handles";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayInstallation } from "@/hooks/use-play-installation";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { cn, exportInstallation } from "@/lib/utils";
import { type Installation, useInstallations } from "@/stores/installations";

/** One entry of the installation action list. */
export type InstallationAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  className: string;
  /** Plain actions call this; trigger actions render `render` instead. */
  onSelect?: () => void;
  nativeButton?: boolean;
  /** Dialog/alert-dialog trigger rendered through the item's `render` prop. */
  render?: React.ReactElement;
  destructive?: boolean;
};

const ITEM_CLASS = "flex items-center justify-between gap-4";
const TRIGGER_ITEM_CLASS = "flex w-full items-center justify-between gap-4";

/**
 * Shared action list for an installation.
 *
 * Rendered by both the sidebar menu and the right-click context menu, which
 * previously carried two copies of the same nine actions.
 */
export function useInstallationActions(installation: Installation): InstallationAction[] {
  const navigate = useNavigate();
  const { toggleFavorite } = useInstallations();
  const { mutate: revealInstallationInFolder } = useRevealInFolder();
  const { mutate: launchInstallation } = usePlayInstallation();
  const { mutate: downloadVersion } = useDownloadVersion();
  const installedVersions = useInstalledVersionNames();

  const versionInstalled = installedVersions?.includes(installation.version) ?? false;

  return [
    versionInstalled
      ? {
          key: "launch",
          label: "Launch",
          icon: <PlayIcon className="inline-block size-4" />,
          className: ITEM_CLASS,
          onSelect: () => launchInstallation({ id: installation.id }),
        }
      : {
          key: "download",
          label: `Download ${installation.version}`,
          icon: <DownloadCloudIcon className="inline-block size-4" />,
          className: ITEM_CLASS,
          onSelect: () => downloadVersion(installation.version),
        },
    {
      key: "favorite",
      label: installation.favorite ? "Unfavorite" : "Favorite",
      icon: (
        <StarIcon
          className={cn(
            "inline-block size-4",
            installation.favorite && "text-warning fill-warning",
          )}
        />
      ),
      className: ITEM_CLASS,
      onSelect: () => toggleFavorite(installation.id),
    },
    {
      key: "manage-mods",
      label: "Manage Mods",
      icon: <PackageSearchIcon className="inline-block size-4" />,
      className: ITEM_CLASS,
      onSelect: () =>
        navigate({
          params: { id: installation.id.toString() },
          to: "/installations/$id/mods",
        }),
    },
    {
      key: "configure-mods",
      label: "Configure Mods",
      icon: <PackageOpenIcon className="inline-block size-4" />,
      className: ITEM_CLASS,
      onSelect: () =>
        navigate({
          params: { id: installation.id.toString() },
          to: "/mod-configs/$id",
        }),
    },
    {
      key: "open-folder",
      label: "Open Folder",
      icon: <FolderOpenIcon className="inline-block size-4" />,
      className: ITEM_CLASS,
      onSelect: () => revealInstallationInFolder(installation.path),
    },
    {
      key: "view-logs",
      label: "View Logs",
      icon: <FileTextIcon className="inline-block size-4" />,
      className: TRIGGER_ITEM_CLASS,
      nativeButton: true,
      render: (
        <DialogTrigger
          handle={rootDialogHandle}
          payload={() => (
            <ViewLogsDialog
              installationName={installation.name}
              installationPath={installation.path}
            />
          )}
        />
      ),
    },
    {
      key: "export",
      label: "Export",
      icon: <FileUpIcon className="inline-block size-4" />,
      className: ITEM_CLASS,
      onSelect: () => exportInstallation({ installation }),
    },
    {
      key: "edit",
      label: "Edit",
      icon: <FolderPenIcon className="inline-block size-4" />,
      className: TRIGGER_ITEM_CLASS,
      nativeButton: true,
      render: (
        <DialogTrigger
          nativeButton={true}
          handle={rootDialogHandle}
          payload={() => <InstallationDialog installation={installation} />}
        />
      ),
    },
    {
      key: "delete",
      label: "Delete",
      icon: <FolderXIcon className="inline-block size-4" />,
      className: TRIGGER_ITEM_CLASS,
      nativeButton: true,
      destructive: true,
      render: (
        <AlertDialogTrigger
          nativeButton={true}
          handle={rootAlertDialogHandle}
          payload={() => <DeleteInstallationDialog installation={installation} />}
        />
      ),
    },
  ];
}

/**
 * Renders the shared action list through the given item primitive (a menu item
 * or a context-menu item — both accept the same props).
 */
export function InstallationActions({
  installation,
  item: Item,
}: {
  installation: Installation;
  item: React.ElementType;
}) {
  const actions = useInstallationActions(installation);

  return (
    <>
      {actions.map((action) => (
        <Item
          key={action.key}
          className={action.className}
          nativeButton={action.nativeButton}
          onClick={action.onSelect}
          render={action.render}
          variant={action.destructive ? "destructive" : undefined}
        >
          {action.label}
          {action.icon}
        </Item>
      ))}
    </>
  );
}
