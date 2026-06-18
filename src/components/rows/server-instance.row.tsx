import { useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  CircleIcon,
  FolderOpenIcon,
  HardDriveIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootTooltipHandle } from "@/handles";
import {
  useServerStatus,
  useStartServer,
  useStopServer,
  useRestartServer,
} from "@/hooks/queries/server-hosting";
import { useServerDataDirSize } from "@/hooks/use-server-data-dir-size";
import type { HostedServerInstance } from "@/lib/server-hosting-types";
import { cn, itemVariants } from "@/lib/utils";

type Props = {
  instance: HostedServerInstance;
  index: number;
  className?: string;
};

const statusColors: Record<string, string> = {
  running: "text-green-500",
  starting: "text-yellow-500",
  stopping: "text-orange-500",
  crashed: "text-red-500",
};

const statusLabels: Record<string, string> = {
  running: "Running",
  starting: "Starting",
  stopping: "Stopping",
  crashed: "Crashed",
  stopped: "Stopped",
};

export function ServerInstanceRow({ instance, index, className }: Props) {
  const router = useRouter();
  const { data: statusData } = useServerStatus(instance.id);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const restartServer = useRestartServer();

  const { data: dirSize } = useServerDataDirSize(instance.id);

  const status = statusData ?? {
    status: "stopped",
    pid: null,
    uptime: null,
    exit_code: null,
  };
  const isRunning = status.status === "running";
  const isStarting = status.status === "starting";
  const isStopping = status.status === "stopping";
  const isCrashed = status.status === "crashed";
  const isBusy = isStarting || isStopping;
  const statusColor = statusColors[status.status] ?? "text-muted-foreground";

  return (
    <motion.div
      animate="show"
      className={cn("flex items-center gap-2 p-2", className)}
      custom={index}
      exit="exit"
      initial="hidden"
      layout="position"
      transition={{
        damping: 32,
        delay: index * 0.05,
        stiffness: 420,
        type: "spring" as const,
      }}
      variants={itemVariants}
    >
      <div className="flex flex-1 items-center gap-3">
        <CircleIcon className={cn("size-2 shrink-0", statusColor)} fill="currentColor" />
        <div className="flex flex-col justify-start">
          <p className="text-foreground text-left text-sm">
            {instance.name}{" "}
            <span className="text-muted-foreground text-xs">
              — {instance.bind_ip}:{instance.port}
            </span>
          </p>
          <p className="text-muted-foreground text-left text-xs">
            v{instance.version}{" "}
            {dirSize && <span className="text-muted-foreground/60">{dirSize.size_display}</span>}
          </p>
          <p className={cn("text-left text-xs", statusColor)}>
            {statusLabels[status.status] ?? status.status}
            {isCrashed && status.exit_code != null && (
              <span className="text-muted-foreground ml-1">(code {status.exit_code})</span>
            )}
            {isRunning && status.uptime != null && (
              <span className="text-muted-foreground ml-1">
                — {Math.floor(status.uptime / 3600)}h {Math.floor((status.uptime % 3600) / 60)}m
              </span>
            )}
          </p>
        </div>
      </div>

      <Group>
        {isRunning ? (
          <TooltipTrigger
            render={
              <Button
                disabled={stopServer.isPending}
                onClick={() => stopServer.mutate(instance.id)}
                size="icon"
                variant="outline"
              >
                <SquareIcon aria-hidden="true" className="-ms-1" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Stop"}
          />
        ) : isCrashed ? (
          <TooltipTrigger
            render={
              <Button
                disabled={restartServer.isPending}
                onClick={() => restartServer.mutate(instance.id)}
                size="icon"
                variant="outline"
              >
                <RotateCcwIcon aria-hidden="true" className="-ms-1" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Restart"}
          />
        ) : (
          <TooltipTrigger
            render={
              <Button
                disabled={isBusy || startServer.isPending}
                onClick={() => startServer.mutate(instance.id)}
                size="icon"
                variant="outline"
              >
                <PlayIcon
                  aria-hidden="true"
                  className={cn("-ms-1", isBusy ? "opacity-60" : "text-success opacity-60")}
                  size={16}
                />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => (isStarting ? "Starting…" : "Start")}
          />
        )}
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              onClick={() =>
                void invoke("reveal_in_file_explorer", {
                  path: instance.data_dir,
                })
              }
              size="icon"
              variant="outline"
            >
              <FolderOpenIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Open data folder"}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              onClick={() =>
                void router.navigate({
                  to: "/server-hosting/$id",
                  params: { id: String(instance.id) },
                })
              }
              size="icon"
              variant="outline"
            >
              <HardDriveIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Manage"}
        />
      </Group>
    </motion.div>
  );
}
