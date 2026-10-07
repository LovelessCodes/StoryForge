import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cn } from "cn";
import insane from "insane";
import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSendCommand, useServerStatus } from "@/hooks/queries/server-hosting";
import type { ServerLogsResponse } from "@/lib/server-hosting-types";

type LogEntry = { timestamp: string; line: string };

function logColor(line: string) {
  if (line.includes("[Server Error]")) return "text-destructive";
  if (line.includes("   at ")) return "text-destructive";
  if (line.includes("[Server Fatal]")) return "text-destructive";
  if (line.includes("[Server Notification]")) return "text-sky-500";
  if (line.includes("[Server Event]")) return "text-success";
  if (line.includes("[Server Debug]")) return "text-info";
  if (line.includes("[Server Warning]")) return "text-warning";
  return "text-foreground";
}

export default function ServerConsole({ instanceId }: { instanceId: number }) {
  const { t } = useTranslation();
  const [logLines, setLogLines] = useState<LogEntry[]>([]);
  const [command, setCommand] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const sendCommand = useSendCommand();
  const { data: statusData } = useServerStatus(instanceId);
  const isRunning = statusData?.status === "running";

  useEffect(() => {
    void invoke<ServerLogsResponse>("get_server_logs", { instanceId, offset: null })
      .then((res) => {
        setLogLines(res.lines.map((line) => ({ line: line.line, timestamp: line.timestamp })));
      })
      .catch(() => {
        // No log yet — the listener will append once the server writes one.
      });
  }, [instanceId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen<LogEntry>(`server-log:${instanceId}`, (event) => {
        setLogLines((prev) => [...prev.slice(-1000), event.payload]);
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [instanceId]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logLines]);

  const handleSend = useCallback(() => {
    const trimmed = command.trim();
    if (!trimmed) return;
    sendCommand.mutate({ id: instanceId, command: trimmed });
    setCommand("");
  }, [command, instanceId, sendCommand]);

  return (
    <div className="grid h-[480px] grid-rows-[1fr_auto] border">
      <ScrollArea viewportRef={viewportRef} scrollFade className="min-h-0">
        <div className="grid gap-0.5 p-3 font-mono text-[11px] leading-relaxed">
          {logLines.length === 0 ? (
            <p className="text-muted-foreground font-sans text-xs">
              {t("hosting.console.waiting")}
            </p>
          ) : (
            logLines.map((entry, index) => (
              <span
                className={cn("break-all whitespace-pre-wrap", logColor(entry.line))}
                dangerouslySetInnerHTML={{
                  __html: insane(entry.line, {
                    allowedTags: ["i", "b", "code", "em", "strong", "u", "span", "br"],
                  }),
                }}
                key={`${entry.timestamp}-${index}`}
                title={entry.timestamp}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t p-2">
        <Input
          className="font-mono"
          disabled={!isRunning}
          placeholder={
            isRunning ? t("hosting.console.commandPlaceholder") : t("hosting.console.notRunning")
          }
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSend();
          }}
        />
        <Button disabled={!isRunning || sendCommand.isPending} size="sm" onClick={handleSend}>
          <Send /> {t("hosting.console.send")}
        </Button>
      </div>
    </div>
  );
}
