import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { CopyIcon, FileTextIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const LOGS_KEY = ["logs"] as const;

export function LogViewer() {
  const ref = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);

  const { data: logs, refetch } = useQuery({
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
    if (logs) {
      navigator.clipboard.writeText(logs).then(
        () => toast.success("Logs copied to clipboard"),
        () => toast.error("Failed to copy logs"),
      );
    }
  }, [logs]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileTextIcon className="size-4" />
          Application Log
        </h2>
        <div className="flex items-center gap-1">
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy logs"
            type="button"
          >
            <CopyIcon className="size-4" />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => refetch()}
            title="Refresh"
            type="button"
          >
            <RefreshCwIcon className="size-4" />
          </button>
        </div>
      </div>
      <pre
        className="bg-muted h-64 overflow-auto rounded border p-3 font-mono text-xs break-all whitespace-pre-wrap"
        onScroll={handleScroll}
        ref={ref}
      >
        {logs || "No logs yet..."}
      </pre>
    </div>
  );
}
