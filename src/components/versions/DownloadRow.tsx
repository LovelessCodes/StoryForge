import { CircleAlert, Loader2, Pause, Play, RotateCw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDownloadManager } from "@/hooks/use-download-manager";
import type { DownloadEntry, DownloadStatus } from "@/stores/downloads";

const statusLabels: Record<DownloadStatus, string> = {
  done: "Done",
  downloading: "Downloading",
  error: "Failed",
  extracting: "Extracting",
  paused: "Paused",
  pending: "Queued",
};

function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null || bytesPerSec <= 0) return "";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSec;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

function StatusIcon({ status }: { status: DownloadStatus }) {
  if (status === "error") {
    return <CircleAlert className="text-destructive size-4 shrink-0" />;
  }
  if (status === "paused") {
    return <Pause className="text-muted-foreground size-4 shrink-0" />;
  }
  return <Loader2 className="text-accent-primary size-4 shrink-0 animate-spin" />;
}

export default function DownloadRow({ entry }: { entry: DownloadEntry }) {
  const { pause, resume, cancel, retry } = useDownloadManager();

  const percent = Math.round(entry.percent ?? 0);
  const speed = formatSpeed(entry.speedBps);
  const canCancel =
    entry.status === "downloading" ||
    entry.status === "pending" ||
    entry.status === "paused" ||
    entry.status === "error";

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 border p-3 transition-colors">
      <StatusIcon status={entry.status} />

      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-medium">{entry.label}</span>
          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
            {statusLabels[entry.status]}
          </Badge>
        </div>

        <Progress value={percent} />

        <div className="text-muted-foreground flex items-center gap-3 text-[10px] tabular-nums">
          {entry.percent !== null && <span>{entry.percent.toFixed(1)}%</span>}
          {speed && <span>{speed}</span>}
          {entry.error && (
            <span className="text-destructive truncate" title={entry.error}>
              {entry.error}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {entry.status === "downloading" && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Pause"
            title="Pause"
            onClick={() => pause(entry.token)}
          >
            <Pause />
          </Button>
        )}
        {entry.status === "paused" && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Resume"
            title="Resume"
            onClick={() => resume(entry.token)}
          >
            <Play />
          </Button>
        )}
        {entry.status === "error" && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Retry"
            title="Retry"
            onClick={() => retry(entry.token)}
          >
            <RotateCw />
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel"
            title="Cancel"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => cancel(entry.token)}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}
