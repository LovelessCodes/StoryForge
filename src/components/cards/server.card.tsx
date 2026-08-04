import { DownloadCloudIcon, Lock, Pencil, Play, Star, Wifi, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootTooltipHandle } from "@/handles";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { useServerStatus } from "@/hooks/use-server-status";
import { cn } from "@/lib/utils";
import { findInstallationForServer, useInstallations } from "@/stores/installations";
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
  const installation = findInstallationForServer(
    installations,
    server.installationId,
    server.installationName,
  );
  const versions = useInstalledVersionNames();

  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();
  const { isChecking, isOnline } = useServerStatus(server);

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`size-2 rounded-full ${
              installation && versions.includes(installation.version)
                ? "bg-success"
                : "bg-muted-foreground/40"
            }`}
            title={
              installation && versions.includes(installation.version)
                ? "Matching version installed"
                : "Matching version not installed"
            }
          />
          {isChecking ? (
            <span title="Checking server status...">
              <Wifi aria-hidden="true" className="text-muted-foreground/40 size-3" />
            </span>
          ) : isOnline ? (
            <span title="Server is online">
              <Wifi aria-hidden="true" className="text-success size-3" />
            </span>
          ) : (
            <span title="Server is unreachable">
              <WifiOff aria-hidden="true" className="text-destructive size-3" />
            </span>
          )}
        </div>
        <div className="text-left">
          <p className="text-foreground font-mono text-sm">
            {server.name}
            {hasPassword ? <Lock className="text-muted-foreground ml-2 inline size-4" /> : null}
          </p>
          {installation?.version && (
            <p className="text-muted-foreground font-mono text-xs">
              v{installation.version} - {streamMode ? "hidden" : serverAddress}
            </p>
          )}
          {!installation && (
            <p className="text-muted-foreground font-mono text-xs">Unknown installation</p>
          )}
        </div>
      </div>
      <Group>
        <TooltipTrigger
          render={
            <Button
              className="text-muted-foreground hover:text-foreground size-8"
              disabled={isInstalling}
              onClick={() =>
                installation && versions.includes(installation.version)
                  ? onConnect({
                      ...server,
                      installationId: installation?.id ?? server.installationId,
                    })
                  : installVersion(installation?.version ?? "")
              }
              size="icon"
              variant="ghost"
            >
              {installation && versions.includes(installation.version) ? (
                <>
                  <Play className="size-4" />
                  <span className="sr-only">Play {server.name}</span>
                </>
              ) : (
                <>
                  <DownloadCloudIcon className="size-4" />
                  <span className="sr-only">
                    Download version {installation?.version ?? "unknown"}
                  </span>
                </>
              )}
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() =>
            installation && versions.includes(installation.version)
              ? `Connect to ${server.name}`
              : `Download version ${installation?.version ?? "unknown"}`
          }
        />
        <TooltipTrigger
          render={
            <Button
              className="text-muted-foreground hover:text-foreground size-8 max-md:hidden"
              onClick={() => onEdit(server)}
              size="icon"
              variant="ghost"
            >
              <Pencil className="size-4" />
              <span className="sr-only">Edit {server.name}</span>
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => `Edit ${server.name}`}
        />
        <TooltipTrigger
          render={
            <Button
              className={cn(
                "size-8 max-md:hidden",
                server.favorite ? "text-warning" : "hover:text-foreground text-muted-foreground",
              )}
              onClick={() => onUnfavorite(server)}
              size="icon"
              variant="ghost"
            >
              <Star className={cn("size-4", server.favorite && "fill-warning")} />
              <span className="sr-only">
                {server.favorite ? "Unfavorite" : "Favorite"} {server.name}
              </span>
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (server.favorite ? "Unfavorite" : "Favorite")}
        />
      </Group>
    </>
  );
}
