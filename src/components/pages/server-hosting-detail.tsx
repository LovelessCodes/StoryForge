import { useParams, useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import clsx from "clsx";
import insane from "insane";
import {
  ArrowLeftIcon,
  PackageIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, lazy } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useHostedServer,
  useServerStatus,
  useServerConfig,
  useStartServer,
  useStopServer,
  useRestartServer,
  useSendCommand,
  useUpdateInstance,
  useDeleteInstance,
  useWriteServerConfig,
} from "@/hooks/queries/server-hosting";
import { useServerDataDirSize } from "@/hooks/use-server-data-dir-size";

import { Group } from "../ui/group";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { ServerHostingWhitelist } from "./server-hosting-whitelist";

const Editor = lazy(() => import("@monaco-editor/react"));

function ServerHostingConsole({ instanceId }: { instanceId: number }) {
  const [logLines, setLogLines] = useState<{ timestamp: string; line: string }[]>([]);
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendCommand = useSendCommand();
  const { data: statusData } = useServerStatus(instanceId);
  const isRunning = statusData?.status === "running";

  useEffect(() => {
    void invoke<{
      lines: { timestamp: string; line: string }[];
      next_offset: number;
      has_more: boolean;
    }>("get_server_logs", { instanceId, offset: null }).then((res) => {
      setLogLines(res.lines.map((l) => ({ timestamp: l.timestamp, line: l.line })));
    });
  }, [instanceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<{ line: string; timestamp: string }>(
        `server-log:${instanceId}`,
        (event) => {
          setLogLines((prev) => [...prev.slice(-1000), event.payload]);
        },
      );
    })();
    return () => {
      unlisten?.();
    };
  }, [instanceId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logLines]);

  const handleSend = useCallback(() => {
    if (!command.trim()) return;
    sendCommand.mutate({ id: instanceId, command: command.trim() });
    setCommand("");
  }, [command, instanceId, sendCommand]);

  const logColor = (line: string) => {
    if (line.includes("[Server Error]")) return "text-destructive";
    if (line.includes("   at ")) return "text-destructive";
    if (line.includes("[Server Fatal]")) return "text-destructive";
    if (line.includes("[Server Notification]")) return "text-sky-500";
    if (line.includes("[Server Event]")) return "text-success";
    if (line.includes("[Server Debug]")) return "text-info";
    if (line.includes("[Server Warning]")) return "text-warning";
    return "text-foreground";
  };

  return (
    <div className="grid h-full grid-rows-[auto_min-content] gap-2">
      <ScrollArea viewportRef={scrollRef} scrollFade>
        {logLines.length === 0 ? (
          <p className="text-muted-foreground">Waiting for output…</p>
        ) : (
          logLines.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span
                className={`break-all whitespace-pre-wrap ${logColor(entry.line)}`}
                dangerouslySetInnerHTML={{
                  __html: insane(entry.line, {
                    allowedTags: ["i", "b", "code", "em", "strong", "u", "span", "br"],
                  }),
                }}
              />
            </div>
          ))
        )}
      </ScrollArea>
      <Group className="flex w-full">
        <Input
          className="font-mono"
          disabled={!isRunning}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          size="sm"
          onChange={(e) => setCommand(e.target.value)}
          placeholder={isRunning ? "Type a server command (e.g. /help)" : "Server not running"}
          value={command}
        />
        <Button disabled={!isRunning} onClick={handleSend} size="sm">
          Send
        </Button>
      </Group>
    </div>
  );
}

function ServerHostingConfig({ instanceId }: { instanceId: number }) {
  const [config, setConfig] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const { data: serverConfig, isPending } = useServerConfig(instanceId);
  const writeConfig = useWriteServerConfig();

  useEffect(() => {
    if (serverConfig !== undefined) {
      setConfig(serverConfig);
      setOriginal(serverConfig);
      setLoading(false);
    }
  }, [serverConfig]);

  const handleSave = async () => {
    if (config === original) {
      toast.info("No changes to save");
      return;
    }
    try {
      JSON.parse(config);
    } catch (e) {
      toast.error(`Failed to save: ${String(e)}`);
      return;
    }
    writeConfig.mutate(
      { id: instanceId, json: config },
      {
        onSuccess: () => {
          setOriginal(config);
          toast.success("serverconfig.json saved. Restart the server to apply changes.");
        },
        onError: (e) => {
          toast.error(`Failed to save: ${String(e)}`);
        },
      },
    );
  };

  const hasChanges = config !== original;

  if (loading || isPending) {
    return (
      <div className="flex h-full flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Edit serverconfig.json. Changes apply on next restart.
        </p>
        <div className="flex gap-2">
          <Button
            disabled={!hasChanges}
            size="sm"
            variant="outline"
            onClick={() => setConfig(original)}
          >
            Reset
          </Button>
          <Button disabled={!hasChanges || writeConfig.isPending} size="sm" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
      <div className="border-input min-h-0 flex-1 border">
        <Editor
          language="json"
          loading={<Skeleton className="h-full min-h-0" />}
          onChange={(v) => setConfig(v ?? "")}
          options={{
            fontSize: 14,
            lineNumbers: "off",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
          theme={document.body.classList.contains("dark") ? "vs-dark" : "vs-light"}
          value={config}
        />
      </div>
    </div>
  );
}

function ServerHostingSettings({
  instanceId,
  canDelete,
}: {
  instanceId: number;
  canDelete: boolean;
}) {
  const router = useRouter();
  const instance = useHostedServer(instanceId);
  const updateInstance = useUpdateInstance();
  const deleteInstance = useDeleteInstance();

  const [name, setName] = useState(instance?.name ?? "");
  const [port, setPort] = useState(String(instance?.port ?? ""));
  const [bindIp, setBindIp] = useState(instance?.bind_ip ?? "");

  useEffect(() => {
    setName(instance?.name ?? "");
    setPort(String(instance?.port ?? ""));
    setBindIp(instance?.bind_ip ?? "");
  }, [instance]);

  if (!instance) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Instance not found.</p>;
  }

  const handleSave = async () => {
    updateInstance.mutate(
      {
        id: instanceId,
        partial: {
          name,
          port: Number(port) || instance.port,
          bind_ip: bindIp,
        },
      },
      {
        onSuccess: () => {
          toast.success("Settings saved");
        },
      },
    );
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);

  const handleDelete = async () => {
    deleteInstance.mutate(
      { id: instanceId, deleteData },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          toast.success("Instance deleted");
          void router.navigate({ to: "/server-hosting" });
        },
      },
    );
  };

  return (
    <ScrollArea scrollFade>
      <div className="flex flex-col gap-4">
        <div className="grid max-w-md gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Name</span>
            <Input onChange={(e) => setName(e.target.value)} value={name} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Port</span>
            <Input onChange={(e) => setPort(e.target.value)} type="number" value={port} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Bind IP</span>
            <Input onChange={(e) => setBindIp(e.target.value)} value={bindIp} />
          </label>
          <div className="flex gap-2 pt-2">
            <Button size="sm" disabled={updateInstance.isPending} onClick={handleSave}>
              Save Settings
            </Button>
          </div>
        </div>

        <hr className="border-border my-4" />

        <div>
          <p className="text-sm font-medium text-red-600">Danger Zone</p>
          <p className="text-muted-foreground mb-2 text-xs">
            Deleting an instance is permanent. You can optionally also delete all server data.
          </p>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={!canDelete}
          >
            <Trash2Icon className="size-3" />
            Delete Instance
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{instance.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The instance configuration will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 px-6 py-2">
            <Checkbox
              checked={deleteData}
              onCheckedChange={(checked) => setDeleteData(Boolean(checked))}
            />
            <span className="text-sm">Also delete all server data (worlds, mods, config)</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogClose>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleteInstance.isPending}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </ScrollArea>
  );
}

export function ServerHostingDetailPage() {
  const { id } = useParams({ from: "/server-hosting/$id/" });
  const router = useRouter();
  const instanceId = Number(id);

  const instance = useHostedServer(instanceId);
  const { data: statusData } = useServerStatus(instanceId);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const restartServer = useRestartServer();

  const status = statusData ?? {
    status: "stopped",
    pid: null,
    uptime: null,
    exit_code: null,
  };

  const { data: dirSize } = useServerDataDirSize(instanceId);

  if (!instance) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground text-sm">Instance not found.</p>
        <Button
          onClick={() => void router.navigate({ to: "/server-hosting" })}
          variant="outline"
          size="sm"
        >
          Back to Server Hosting
        </Button>
      </div>
    );
  }

  const isRunning = status.status === "running";
  const isBusy = status.status === "starting" || status.status === "stopping";
  const statusColor =
    (
      {
        running: "text-green-500",
        starting: "text-yellow-500",
        stopping: "text-orange-500",
        crashed: "text-red-500",
      } as Record<string, string>
    )[status.status] ?? "text-muted-foreground";

  return (
    <div className="flex h-full flex-col gap-4 pt-2">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => void router.navigate({ to: "/server-hosting" })}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{instance.name}</h1>
              {status.pid && <span className="text-muted-foreground">PID {status.pid}</span>}
            </div>
            <p className="flex items-center gap-2 text-sm">
              <span className={clsx("flex items-center gap-1", statusColor)}>
                ● {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              </span>
              {isRunning && status.uptime != null && (
                <span className="text-muted-foreground">
                  up {Math.floor(status.uptime / 3600)}h {Math.floor((status.uptime % 3600) / 60)}m
                </span>
              )}
              <span className="text-muted-foreground font-mono">
                {instance.bind_ip}:{instance.port}
              </span>
              {dirSize && <span className="text-muted-foreground/60">{dirSize.size_display}</span>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void router.navigate({ to: "/server-hosting/$id/mods", params: { id: id } })
            }
            className="text-muted-foreground hover:text-foreground mr-2 shrink-0"
          >
            <PackageIcon className="mr-1 size-3" /> Mods
          </Button>
          {isRunning ? (
            <Button
              size="sm"
              variant="outline"
              disabled={stopServer.isPending}
              onClick={() => stopServer.mutate(instanceId)}
            >
              <SquareIcon className="size-3" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy || startServer.isPending}
              onClick={() => startServer.mutate(instanceId)}
            >
              <PlayIcon className="size-3" /> Start
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy || !isRunning || restartServer.isPending}
            onClick={() => restartServer.mutate(instanceId)}
          >
            <RotateCcwIcon className="size-3" /> Restart
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="console" className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center border-b">
          <TabsList className="flex-1 border-0">
            <TabsTrigger value="console">
              <TerminalIcon className="mr-1 size-3" /> Console
            </TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent className="mt-4 min-h-0 flex-1" value="console">
          <ServerHostingConsole instanceId={instanceId} />
        </TabsContent>
        <TabsContent className="mt-4 min-h-0 flex-1 px-2" value="config">
          <ServerHostingConfig instanceId={instanceId} />
        </TabsContent>
        <TabsContent className="mt-4 min-h-0 flex-1 px-2" value="whitelist">
          <ServerHostingWhitelist instanceId={instanceId} />
        </TabsContent>
        <TabsContent className="mt-4 min-h-0 flex-1 px-2" value="settings">
          <ServerHostingSettings instanceId={instanceId} canDelete={status.status === "stopped"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
