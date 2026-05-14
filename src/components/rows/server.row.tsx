import { DownloadCloudIcon, PencilIcon, PlugIcon, StarIcon, TrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupItem, GroupSeparator } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { useDialogStore } from "@/stores/dialogs";
import { useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

type ServerRowProps = {
  server: Server;
};

export function ServerRow({ server }: ServerRowProps) {
  // Stores
  const { openDialog } = useDialogStore();
  const { toggleFavorite } = useServerStore();
  const { streamMode } = useSettingsStore();
  const { data: versions } = useInstalledVersions();
  const { installations } = useInstallations();
  const installation = installations.find((inst) => inst.id === server.installationId);

  // Mutations
  const { mutate: connectToServer } = useConnectToServer();
  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();

  return (
    <div className="flex items-center gap-2 px-2 py-2">
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
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    disabled={isInstalling}
                    onClick={() =>
                      versions?.includes(installation?.version ?? "")
                        ? connectToServer({
                            installationId: server.installationId,
                            ip: `${server.ip}${server.port ? `:${server.port}` : ""}`,
                            name: server.name,
                            password: server.password,
                          })
                        : installVersion(installation?.version ?? "")
                    }
                    variant="outline"
                  />
                }
              >
                {versions?.includes(installation?.version ?? "") ? (
                  <PlugIcon
                    aria-hidden="true"
                    className="text-success -ms-1 opacity-60"
                    size={16}
                  />
                ) : (
                  <DownloadCloudIcon
                    aria-hidden="true"
                    className="text-warning-foreground -ms-1 opacity-60"
                    size={16}
                  />
                )}
              </GroupItem>
            }
          />
          <TooltipContent>
            {versions?.includes(installation?.version ?? "")
              ? "Connect"
              : `Install ${installation?.version ?? ""}`}
          </TooltipContent>
        </Tooltip>
        <GroupSeparator />
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={<Button onClick={() => toggleFavorite(server.id)} variant="outline" />}
              >
                <StarIcon
                  aria-hidden="true"
                  className={cn(
                    "-ms-1",
                    server.favorite ? "fill-warning text-warning opacity-100" : "opacity-60",
                  )}
                  size={16}
                />
              </GroupItem>
            }
          />
          <TooltipContent>{server.favorite ? "Unfavorite" : "Favorite"}</TooltipContent>
        </Tooltip>
        <GroupSeparator />
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    onClick={() => openDialog("EditServerDialog", { server })}
                    variant="outline"
                  />
                }
              >
                <PencilIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              </GroupItem>
            }
          />
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <GroupSeparator />
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    aria-label="Delete"
                    onClick={() => openDialog("DeleteServerDialog", { server })}
                    size="icon"
                    variant="outline"
                  />
                }
              >
                <TrashIcon aria-hidden="true" className="opacity-60" size={16} />
              </GroupItem>
            }
          />
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </Group>
    </div>
  );
}
