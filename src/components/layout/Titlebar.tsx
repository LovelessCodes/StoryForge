import { Clock, Download, Loader2, Pause, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import { useRunCommand } from "@/components/command-runtime";
import ThemeToggle from "@/components/common/ThemeToggle";
import DownloadsSheet from "@/components/downloads/DownloadsSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { notify } from "@/components/ui/toast";
import { useUpdater } from "@/hooks/use-updater";
import { useDownloadStore } from "@/stores/downloads";

export default function Titlebar() {
  const runCommand = useRunCommand();
  const { data: update } = useUpdater();
  const entries = useDownloadStore((s) => s.entries);
  const [installing, setInstalling] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  const list = Object.values(entries);
  const active = list.filter((e) => e.status === "downloading" || e.status === "extracting");
  const paused = list.some((e) => e.status === "paused");
  const waiting = list.some((e) => e.status === "pending");
  const pendingCount = list.filter((e) => e.status !== "done" && e.status !== "error").length;
  const percent =
    active.length > 0 ? Math.max(0, Math.min(100, Math.round(active[0].percent ?? 0))) : null;

  const downloadIcon =
    active.length > 0 ? (
      <Loader2 className="animate-spin" />
    ) : paused ? (
      <Pause />
    ) : waiting ? (
      <Clock />
    ) : (
      <Download />
    );

  async function installUpdate() {
    if (!update || installing) return;
    setInstalling(true);
    let downloaded = 0;
    let total = 0;
    notify("updater", {
      type: "loading",
      timeout: 0,
      title: `Downloading Story Forge ${update.version}…`,
    });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : null;
          notify("updater", {
            type: "loading",
            timeout: 0,
            title: `Downloading Story Forge ${update.version}…${pct !== null ? ` ${pct}%` : ""}`,
          });
        }
      });
      notify("updater", {
        type: "success",
        timeout: 0,
        title: "Update installed — restarting…",
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      setInstalling(false);
      notify("updater", {
        type: "error",
        title: "Update failed",
        description: String(error),
      });
    }
  }

  const updateButton = update ? (
    <Button
      variant="outline-accent-primary"
      size="xs"
      onClick={() => void installUpdate()}
      disabled={installing}
      title={`Update to Story Forge ${update.version}`}
    >
      {installing ? <Loader2 className="animate-spin" /> : <RotateCcw />}
      Update v{update.version}
    </Button>
  ) : null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex h-8 items-center gap-2 pr-2 pl-19 select-none"
      data-tauri-drag-region="deep"
    >
      <SidebarTrigger />
      <div className="bg-muted block h-2/3 w-0.5" />
      <span className="text-muted-foreground hidden truncate text-[10px] font-medium tracking-widest whitespace-nowrap uppercase sm:inline">
        Story Forge
      </span>
      {updateButton}

      <div className="ms-auto flex items-center gap-1">
        {active.length > 0 && percent !== null && (
          <Progress
            value={percent}
            aria-label={`Download progress: ${percent}%`}
            title={`Download progress: ${percent}%`}
            className="[&_[data-slot=progress-indicator]]:bg-accent-primary mr-1 w-24 [&_[data-slot=progress-track]]:h-1.5"
          />
        )}
        <Button
          variant={paused ? "outline-warning" : "outline"}
          size="xs"
          className="text-muted-foreground gap-2"
          onClick={() => setDownloadsOpen(true)}
          title="Downloads"
        >
          {downloadIcon}
          <span className="hidden sm:inline">Downloads</span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
              {pendingCount}
            </Badge>
          )}
        </Button>
        <Button
          variant="outline"
          size="xs"
          className="text-muted-foreground gap-2"
          onClick={() => runCommand("app.commandPalette")}
          title="Search pages and actions"
        >
          <Search />
          <span className="hidden sm:inline">Search</span>
          <kbd className="pointer-events-none hidden rounded-none border px-1 font-sans text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
      </div>

      <DownloadsSheet open={downloadsOpen} onOpenChange={setDownloadsOpen} />
    </div>
  );
}
