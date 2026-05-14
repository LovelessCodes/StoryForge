import { DownloadCloudIcon, Lock, Pencil, Play, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import type { Server } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

interface ServerCardProps {
  server: Server;
  onConnect: (server: Server) => void;
  onUnfavorite: (server: Server) => void;
  onEdit: (server: Server) => void;
}

export function ServerCard({ server, onConnect, onUnfavorite, onEdit }: ServerCardProps) {
  const serverAddress = server.port ? `${server.ip}:${server.port}` : server.ip;
  const hasPassword = server.password && server.password.length > 0;
  const { installations } = useInstallations();
  const { streamMode } = useSettingsStore();
  const installation = installations.find((inst) => inst.id === server.installationId);
  const { data: versions } = useInstalledVersions();

  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();
  if (!installation) return null;

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className={`h-2 w-2 rounded-full ${
            versions.includes(installation.version) ? "bg-success" : "bg-muted-foreground/40"
          }`}
        />
        <div className="text-left">
          <p className="text-foreground font-mono text-sm">
            {server.name}
            {hasPassword ? <Lock className="text-muted-foreground ml-2 inline h-4 w-4" /> : null}
          </p>
          {installation.version && (
            <p className="text-muted-foreground font-mono text-xs">
              v{installation.version} - {streamMode ? "hidden" : serverAddress}
            </p>
          )}
        </div>
      </div>
      <Group>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    disabled={isInstalling}
                    onClick={() =>
                      versions.includes(installation.version)
                        ? onConnect(server)
                        : installVersion(installation.version)
                    }
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                {versions.includes(installation.version) ? (
                  <>
                    <Play className="h-4 w-4" />
                    <span className="sr-only">Play {server.name}</span>
                  </>
                ) : (
                  <>
                    <DownloadCloudIcon className="h-4 w-4" />
                    <span className="sr-only">Download version {installation.version}</span>
                  </>
                )}
              </GroupItem>
            }
          />
          <TooltipContent>
            {versions.includes(installation.version)
              ? `Connect to ${server.name}`
              : `Download version ${installation.version}`}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    onClick={() => onEdit(server)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit {server.name}</span>
              </GroupItem>
            }
          />
          <TooltipContent>Edit {server.name}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className={cn(
                      "h-8 w-8",
                      server.favorite
                        ? "text-warning"
                        : "hover:text-foreground text-muted-foreground",
                    )}
                    onClick={() => onUnfavorite(server)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <Star className={cn("h-4 w-4", server.favorite && "fill-warning")} />
                <span className="sr-only">
                  {server.favorite ? "Unfavorite" : "Favorite"} {server.name}
                </span>
              </GroupItem>
            }
          />
          <TooltipContent>
            {server.favorite ? "Unfavorite" : "Favorite"} {server.name}
          </TooltipContent>
        </Tooltip>
      </Group>
    </>
  );
}
