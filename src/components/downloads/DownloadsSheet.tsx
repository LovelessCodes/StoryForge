import { Loader2, Pause, RotateCcw, Undo2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { useInstalledMods } from "@/hooks/use-installed-mods";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { pathDelimiter } from "@/lib/helpers";
import { useDownloadStore, type DownloadEntry } from "@/stores/downloads";

const statusLabel: Record<DownloadEntry["status"], string> = {
  done: "Done",
  downloading: "Downloading",
  error: "Failed",
  extracting: "Extracting",
  paused: "Paused",
  pending: "Queued",
};

/**
 * Whether a finished download still exists on disk. The installed lists are
 * the app's source of truth (the Mods and Versions pages refresh them), so a
 * manual removal hides the row's Undo instead of failing later. Until the
 * relevant list has loaded, the download is assumed to be there.
 */
function useDownloadStillInstalled(entry: DownloadEntry): boolean {
  const modsSuffix = `${pathDelimiter}Mods`;
  const modsRoot =
    entry.modsDirectory ??
    (entry.destpath?.endsWith(modsSuffix)
      ? entry.destpath.slice(0, -modsSuffix.length)
      : (entry.destpath ?? ""));
  const isDoneMod = entry.kind === "mod" && entry.status === "done" && !!entry.savedPath;
  const mods = useInstalledMods(modsRoot, { enabled: isDoneMod && !!modsRoot });
  const versions = useInstalledVersions();

  if (entry.status !== "done") return true;
  if (entry.kind === "version") {
    if (!versions.data) return true;
    return versions.data.some((version) => version.name === entry.token);
  }
  if (!entry.savedPath) return false;
  if (!mods.data) return true;
  return mods.data.mods.some((mod) => mod.path === entry.savedPath);
}

function DownloadRow({ entry }: { entry: DownloadEntry }) {
  const { pause, resume, cancel, retry, undo } = useDownloadManager();
  const stillInstalled = useDownloadStillInstalled(entry);
  const canUndo =
    entry.status === "done" && stillInstalled && (entry.kind === "version" || !!entry.savedPath);

  return (
    <li className="grid gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="truncate text-xs font-medium">{entry.label}</span>
        {entry.detail && (
          <span className="text-muted-foreground truncate text-[11px]">→ {entry.detail}</span>
        )}
        <Badge variant="secondary" className="ml-auto h-4 shrink-0 px-1.5 text-[10px]">
          {statusLabel[entry.status]}
        </Badge>
      </div>
      {entry.status !== "done" && (
        <>
          <Progress value={entry.percent ?? 0} />
          <div className="text-muted-foreground flex items-center gap-3 text-[11px] tabular-nums">
            <span>{entry.percent !== null ? `${entry.percent.toFixed(0)}%` : "…"}</span>
            {entry.speedBps !== null && (
              <span>{(entry.speedBps / 1024 / 1024).toFixed(1)} MB/s</span>
            )}
            {entry.error && <span className="text-destructive truncate">{entry.error}</span>}
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        {(entry.status === "downloading" || entry.status === "pending") && (
          <Button variant="outline" size="xs" onClick={() => pause(entry.token)}>
            <Pause /> Pause
          </Button>
        )}
        {entry.status === "paused" && (
          <Button variant="outline" size="xs" onClick={() => resume(entry.token)}>
            <Loader2 /> Resume
          </Button>
        )}
        {entry.status === "error" && (
          <Button variant="outline" size="xs" onClick={() => retry(entry.token)}>
            <RotateCcw /> Retry
          </Button>
        )}
        {canUndo && (
          <Button variant="outline" size="xs" onClick={() => undo(entry.token)}>
            <Undo2 /> Undo
          </Button>
        )}
        {entry.status === "done" && !stillInstalled && (
          <span className="text-muted-foreground text-[11px]">
            {entry.kind === "version" ? "Version removed" : "Mod removed"}
          </span>
        )}
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground ml-auto"
          onClick={() => cancel(entry.token)}
        >
          <X /> {entry.status === "done" || entry.status === "error" ? "Dismiss" : "Cancel"}
        </Button>
      </div>
    </li>
  );
}

interface DownloadsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DownloadsSheet({ open, onOpenChange }: DownloadsSheetProps) {
  const entries = useDownloadStore((s) => s.entries);
  const list = Object.values(entries);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Downloads</SheetTitle>
          <SheetDescription>Game versions and mods downloading in the background.</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          {list.length === 0 ? (
            <p className="text-muted-foreground p-6 text-xs">No downloads right now.</p>
          ) : (
            <ul className="divide-y">
              {list.map((entry) => (
                <DownloadRow entry={entry} key={entry.token} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
