import { DownloadCloudIcon, PencilIcon, PlugIcon, StarIcon, TrashIcon } from "lucide-react";

import { DeleteServerDialog } from "@/components/dialogs/deleteserver.dialog";
import { ServerDialog } from "@/components/dialogs/server.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootAlertDialogHandle, rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { findInstallationForServer, useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

type ServerRowProps = {
  server: Server;
};

export function ServerRow({ server }: ServerRowProps) {
  // Stores
  const { toggleFavorite } = useServerStore();
  const { streamMode } = useSettingsStore();
  const versions = useInstalledVersionNames();
  const { installations } = useInstallations();
  const installation = findInstallationForServer(
    installations,
    server.installationId,
    server.installationName,
  );

  // Mutations
  const { mutate: connectToServer } = useConnectToServer();
  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();

  return (
    <div className="flex items-center gap-2 p-2">
      <div className="flex flex-1 flex-col">
        <p className="text-sm">{server.name}</p>
        <p className="text-muted-foreground text-xs">
          {streamMode ? (
            <span className="text-warning-foreground">hidden</span>
          ) : (
            <span className="text-warning-foreground">
              {server.ip}
              {server.port ? `:${server.port}` : ""}
            </span>
          )}
          <span className="text-muted-foreground">
            {" "}
            via {installation?.name ?? "Unknown Installation"}
          </span>
        </p>
      </div>
      <Group>
        <TooltipTrigger
          render={
            <Button
              disabled={isInstalling}
              onClick={() =>
                versions?.includes(installation?.version ?? "")
                  ? connectToServer({
                      installationId: installation?.id ?? server.installationId,
                      ip: `${server.ip}${server.port ? `:${server.port}` : ""}`,
                      name: server.name,
                      password: server.password,
                    })
                  : installVersion(installation?.version ?? "")
              }
              variant="outline"
            >
              {versions?.includes(installation?.version ?? "") ? (
                <PlugIcon aria-hidden="true" className="text-success -ms-1 opacity-60" size={16} />
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
          payload={() =>
            versions?.includes(installation?.version ?? "")
              ? "Connect"
              : `Install ${installation?.version ?? ""}`
          }
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button onClick={() => toggleFavorite(server.id)} variant="outline">
              <StarIcon
                aria-hidden="true"
                className={cn(
                  "-ms-1",
                  server.favorite ? "fill-warning text-warning opacity-100" : "opacity-60",
                )}
                size={16}
              />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (server.favorite ? "Unfavorite" : "Favorite")}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <ServerDialog server={server} />}
                />
              }
              variant="outline"
            >
              <PencilIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Edit"}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              aria-label="Delete"
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => <DeleteServerDialog server={server} />}
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
      </Group>
    </div>
  );
}
