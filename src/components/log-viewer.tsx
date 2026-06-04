import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { FileTextIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const LOGS_KEY = ["logs"] as const;

export function LogViewer() {
  const ref = useRef<HTMLPreElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data: logs, refetch } = useQuery({
    queryFn: () => invoke<string>("get_logs"),
    queryKey: LOGS_KEY,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (autoScroll && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileTextIcon className="size-4" />
          Application Log
        </h2>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => refetch()}
          title="Refresh"
          type="button"
        >
          <RefreshCwIcon className="size-4" />
        </button>
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
