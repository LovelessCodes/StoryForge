import { PauseIcon, PlayIcon, RotateCwIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootTooltipHandle } from "@/handles";
import { useDownloadManager } from "@/hooks/use-download-manager";
import type { DownloadEntry } from "@/stores/downloads";

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

export function DownloadRow({ entry }: { entry: DownloadEntry }) {
  const { pause, resume, cancel, retry } = useDownloadManager();

  const percent = entry.percent ?? 0;
  const speed = formatSpeed(entry.speedBps);
  const statusLabel = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);

  return (
    <>
      <span className="flex flex-1 flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          <span>{entry.label}</span>
          <span className="text-muted-foreground text-xs">{statusLabel}</span>
        </span>
        <Progress value={Math.round(percent)}>
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
        <span className="text-muted-foreground flex gap-2 text-xs tabular-nums">
          {percent > 0 && <span>{percent.toFixed(1)}%</span>}
          {speed && <span>{speed}</span>}
          {entry.error && <span className="text-destructive">{entry.error}</span>}
        </span>
      </span>
      <Group>
        {entry.status === "downloading" && (
          <TooltipTrigger
            render={
              <Button
                aria-label="Pause"
                onClick={() => pause(entry.token)}
                size="icon"
                variant="outline"
              >
                <PauseIcon aria-hidden="true" className="opacity-60" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Pause"}
          />
        )}
        {entry.status === "paused" && (
          <TooltipTrigger
            render={
              <Button
                aria-label="Resume"
                onClick={() => resume(entry.token)}
                size="icon"
                variant="outline"
              >
                <PlayIcon aria-hidden="true" className="opacity-60" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Resume"}
          />
        )}
        {entry.status === "error" && (
          <TooltipTrigger
            render={
              <Button
                aria-label="Retry"
                onClick={() => retry(entry.token)}
                size="icon"
                variant="outline"
              >
                <RotateCwIcon aria-hidden="true" className="opacity-60" size={16} />
              </Button>
            }
            handle={rootTooltipHandle}
            payload={() => "Retry"}
          />
        )}
        {(entry.status === "downloading" ||
          entry.status === "pending" ||
          entry.status === "paused") && (
          <>
            {entry.status !== "downloading" && <GroupSeparator />}
            <TooltipTrigger
              render={
                <Button
                  aria-label="Cancel"
                  onClick={() => cancel(entry.token)}
                  size="icon"
                  variant="outline"
                >
                  <XIcon aria-hidden="true" className="opacity-60" size={16} />
                </Button>
              }
              handle={rootTooltipHandle}
              payload={() => "Cancel"}
            />
          </>
        )}
      </Group>
    </>
  );
}
