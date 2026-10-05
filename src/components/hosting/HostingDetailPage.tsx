import { Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowLeft, Package, Play, RotateCcw, Square, Terminal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ListSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useHostedServer,
  useHostedServers,
  useRestartServer,
  useServerStatus,
  useServerStatusListener,
  useStartServer,
  useStopServer,
} from "@/hooks/queries/server-hosting";
import { useServerDataDirSize } from "@/hooks/use-server-data-dir-size";

import ServerConfigEditor from "./ServerConfigEditor";
import ServerConsole from "./ServerConsole";
import ServerModeration from "./ServerModeration";
import ServerSettingsPane from "./ServerSettingsPane";
import ServerWhitelist from "./ServerWhitelist";
import { formatUptime, statusDot, statusLabels, statusText } from "./status-meta";

type HostingSection = "console" | "config" | "whitelist" | "moderation" | "settings";

export default function HostingDetailPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // `/server-hosting/$id/mods` is a child route of this one, so when it is
  // active this page only hands rendering over to the child.
  if (pathname.endsWith("/mods")) return <Outlet />;

  return <HostingDetailContent />;
}

function HostingDetailContent() {
  const { t } = useTranslation();
  const { id } = useParams({ from: "/_app/server-hosting/$id" });
  const navigate = useNavigate();
  const instanceId = Number(id);

  // Live status events for this route (the servers page mounts the same hook
  // while it is active; both routes are never mounted at the same time).
  useServerStatusListener();

  const { isPending } = useHostedServers();
  const instance = useHostedServer(instanceId);
  const { data: statusData } = useServerStatus(instanceId);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const restartServer = useRestartServer();
  const { data: dirSize } = useServerDataDirSize(instanceId);
  const [section, setSection] = useState<HostingSection>("console");

  const status = statusData ?? {
    status: "stopped" as const,
    pid: null,
    uptime: null,
    exit_code: null,
  };

  function goBack() {
    void navigate({
      to: "/servers",
      // The servers route has no search schema; keep params loosely.
      search: ((prev: Record<string, unknown>) => ({ ...prev, tab: "hosting" })) as never,
    });
  }

  if (!instance) {
    if (isPending) {
      return <ListSkeleton rows={4} />;
    }
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground text-sm">{t("hosting.instanceNotFound")}</p>
        <Button size="sm" variant="outline" onClick={goBack}>
          {t("hosting.detail.backToServers")}
        </Button>
      </div>
    );
  }

  const isRunning = status.status === "running";
  const isBusy = status.status === "starting" || status.status === "stopping";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            aria-label={t("hosting.detail.backToServersAria")}
            size="icon-sm"
            variant="ghost"
            onClick={goBack}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{instance.name}</h1>
              {status.pid != null && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {t("hosting.detail.pid", { pid: status.pid })}
                </span>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className={cn("flex items-center gap-1.5", statusText[status.status])}>
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", statusDot[status.status])}
                />
                {statusLabels[status.status] ?? status.status}
                {status.status === "crashed" && status.exit_code != null && (
                  <span className="text-muted-foreground">
                    {t("hosting.detail.exitCode", { code: status.exit_code })}
                  </span>
                )}
              </span>
              {isRunning && status.uptime != null && (
                <span className="text-muted-foreground">
                  {t("hosting.detail.uptime", { duration: formatUptime(status.uptime) })}
                </span>
              )}
              <span className="text-muted-foreground font-mono">
                {instance.bind_ip}:{instance.port}
              </span>
              {dirSize && <span className="text-muted-foreground/60">{dirSize.size_display}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigate({ to: "/server-hosting/$id/mods", params: { id: String(id) } })
            }
          >
            <Package /> {t("hosting.detail.mods")}
          </Button>
          {isRunning ? (
            <Button
              disabled={stopServer.isPending}
              size="sm"
              variant="outline"
              onClick={() => stopServer.mutate(instanceId)}
            >
              <Square /> {t("common.actions.stop")}
            </Button>
          ) : (
            <Button
              disabled={isBusy || startServer.isPending}
              size="sm"
              variant="outline-success"
              onClick={() => startServer.mutate(instanceId)}
            >
              <Play /> {t("hosting.detail.start")}
            </Button>
          )}
          <Button
            disabled={isBusy || !isRunning || restartServer.isPending}
            size="sm"
            variant="outline"
            onClick={() => restartServer.mutate(instanceId)}
          >
            <RotateCcw /> {t("common.actions.restart")}
          </Button>
        </div>
      </div>

      <ToggleGroup
        aria-label={t("hosting.detail.sectionAria")}
        onValueChange={(value) => value[0] && setSection(value[0] as HostingSection)}
        size="sm"
        value={[section]}
        variant="outline"
      >
        <ToggleGroupItem value="console">
          <Terminal /> {t("hosting.sections.console")}
        </ToggleGroupItem>
        <ToggleGroupItem value="config">{t("hosting.sections.config")}</ToggleGroupItem>
        <ToggleGroupItem value="whitelist">{t("hosting.sections.whitelist")}</ToggleGroupItem>
        <ToggleGroupItem value="moderation">{t("hosting.sections.moderation")}</ToggleGroupItem>
        <ToggleGroupItem value="settings">{t("hosting.sections.settings")}</ToggleGroupItem>
      </ToggleGroup>

      {section === "console" && <ServerConsole instanceId={instanceId} key={instanceId} />}
      {section === "config" && <ServerConfigEditor instanceId={instanceId} key={instanceId} />}
      {section === "whitelist" && <ServerWhitelist instanceId={instanceId} />}
      {section === "moderation" && <ServerModeration instanceId={instanceId} />}
      {section === "settings" && (
        <ServerSettingsPane canDelete={status.status === "stopped"} instanceId={instanceId} />
      )}
    </div>
  );
}
