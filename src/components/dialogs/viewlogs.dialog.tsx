import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { FileTextIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";

import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type LogFile = {
  name: string;
  size_bytes: number;
  path: string;
};

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export type ViewLogsDialogProps = {
  installationPath: string;
  installationName: string;
};

export function ViewLogsDialog({
  installationPath,
  installationName,
}: {
  installationPath: string;
  installationName: string;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryFn: () => invoke<LogFile[]>("get_installation_logs", { installationPath }),
    queryKey: ["installation-logs", installationPath],
  });

  const { data: content, isLoading: isLoadingContent } = useQuery({
    enabled: !!activeTab,
    queryFn: () =>
      invoke<string>("read_installation_log", {
        logPath: logs?.find((l) => l.name === activeTab)?.path,
      }),
    queryKey: ["installation-log-content", activeTab],
  });

  return (
    <>
      <DialogClose />
      <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
        <DialogTitle>{installationName}: Logs</DialogTitle>
        <DialogDescription>View the game's log files for this installation</DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex h-full items-center justify-center gap-2 p-8">
          <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading logs…</span>
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className="flex h-full items-center justify-center p-8">
          <p className="text-muted-foreground text-sm">No log files found</p>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          {/* Tabs */}
          <div className="flex shrink-0 gap-0 overflow-x-auto border-b">
            {logs.map((log) => (
              <button
                className={`shrink-0 cursor-pointer border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === log.name
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
                key={log.name}
                onClick={() => setActiveTab(log.name)}
                type="button"
              >
                <FileTextIcon className="mr-1 inline size-3" />
                {log.name}
                <span className="text-muted-foreground ml-2 opacity-50">
                  {formatSize(log.size_bytes)}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          {!activeTab ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="text-muted-foreground text-sm">Select a log file to view</p>
            </div>
          ) : isLoadingContent ? (
            <div className="flex h-full items-center justify-center gap-2 p-8">
              <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
              <span className="text-muted-foreground text-sm">Loading…</span>
            </div>
          ) : (
            <pre className="p-4 font-mono text-xs break-all whitespace-pre-wrap">
              {content || "Empty"}
            </pre>
          )}
        </div>
      )}
    </>
  );
}
