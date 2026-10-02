import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { CopyIcon, FileTextIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/lib/notify";

const LOGS_KEY = ["logs"] as const;

/** Application log tail with auto-scroll, copy and manual refresh. */
export default function LogViewer() {
  const ref = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);

  const {
    data: logs,
    refetch,
    isFetching,
  } = useQuery({
    queryFn: () => invoke<string>("get_logs"),
    queryKey: LOGS_KEY,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (autoScrollRef.current && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = () => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const handleCopy = useCallback(() => {
    if (!logs) return;
    navigator.clipboard.writeText(logs).then(
      () => toast.success("Logs copied to clipboard"),
      () => toast.error("Failed to copy logs"),
    );
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileTextIcon className="size-4" />
          Application log
        </CardTitle>
        <CardDescription>Live app output, refreshed every 5 seconds.</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            aria-label="Copy logs"
            disabled={!logs}
            onClick={handleCopy}
            size="icon-sm"
            title="Copy logs"
            variant="ghost"
          >
            <CopyIcon />
          </Button>
          <Button
            aria-label="Refresh logs"
            disabled={isFetching}
            onClick={() => void refetch()}
            size="icon-sm"
            title="Refresh"
            variant="ghost"
          >
            <RefreshCwIcon className={isFetching ? "animate-spin" : undefined} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre
          className="bg-muted h-64 overflow-auto border p-3 font-mono text-[11px] break-all whitespace-pre-wrap"
          onScroll={handleScroll}
          ref={ref}
        >
          {logs || "No logs yet..."}
        </pre>
      </CardContent>
    </Card>
  );
}
