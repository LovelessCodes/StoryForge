import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { FolderOpen, Play, RotateCcw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  formatUptime,
  statusDot,
  statusLabels,
  statusText,
} from "@/components/hosting/status-meta";
import { Button } from "@/components/ui/button";
import {
  useRestartServer,
  useServerStatus,
  useStartServer,
  useStopServer,
} from "@/hooks/queries/server-hosting";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { useServerDataDirSize } from "@/hooks/use-server-data-dir-size";
import type { HostedServerInstance } from "@/lib/server-hosting-types";

export default function HostedInstanceRow({ instance }: { instance: HostedServerInstance }) {
  const { t } = useTranslation();
  const { data: statusData } = useServerStatus(instance.id);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const restartServer = useRestartServer();
  const { data: dirSize } = useServerDataDirSize(instance.id);
  const revealInFolder = useRevealInFolder();

  const status = statusData ?? {
    status: "stopped" as const,
    pid: null,
    uptime: null,
    exit_code: null,
  };
  const isRunning = status.status === "running";
  const isCrashed = status.status === "crashed";
  const isBusy = status.status === "starting" || status.status === "stopping";

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", statusDot[status.status])}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{instance.name}</span>
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
            {instance.bind_ip}:{instance.port}
          </span>
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          <span>v{instance.version}</span>
          {dirSize && <span>{dirSize.size_display}</span>}
          <span className={statusText[status.status]}>
            {statusLabels[status.status] ?? status.status}
            {isCrashed && status.exit_code != null && (
              <span className="text-muted-foreground ml-1">
                {t("servers.hostedRow.exitCode", { code: status.exit_code })}
              </span>
            )}
            {isRunning && status.uptime != null && (
              <span className="text-muted-foreground ml-1">— {formatUptime(status.uptime)}</span>
            )}
          </span>
        </div>
      </div>

      {isRunning ? (
        <Button
          size="sm"
          variant="outline"
          disabled={stopServer.isPending}
          onClick={() => stopServer.mutate(instance.id)}
        >
          <Square /> {t("common.actions.stop")}
        </Button>
      ) : isCrashed ? (
        <Button
          size="sm"
          variant="outline"
          disabled={restartServer.isPending}
          onClick={() => restartServer.mutate(instance.id)}
        >
          <RotateCcw /> {t("common.actions.restart")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline-success"
          disabled={isBusy || startServer.isPending}
          onClick={() => startServer.mutate(instance.id)}
        >
          <Play />{" "}
          {status.status === "starting"
            ? t("servers.hostedRow.starting")
            : t("servers.hostedRow.start")}
        </Button>
      )}

      <Button
        aria-label={t("servers.hostedRow.openDataFolderAria", { name: instance.name })}
        size="icon-sm"
        title={t("servers.hostedRow.openDataFolder")}
        variant="ghost"
        onClick={() => revealInFolder.mutate(instance.data_dir)}
      >
        <FolderOpen />
      </Button>

      <Button
        render={<Link params={{ id: String(instance.id) }} to="/server-hosting/$id" />}
        size="sm"
        variant="outline"
      >
        {t("servers.actions.manage")}
      </Button>
    </div>
  );
}
