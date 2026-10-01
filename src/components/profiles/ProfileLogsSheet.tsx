import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Profile } from "@/stores/profiles";

type ProfileLog = { name: string; size_bytes: number; path: string };

interface ProfileLogsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}

export default function ProfileLogsSheet({ open, onOpenChange, profile }: ProfileLogsSheetProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const logsQuery = useQuery({
    queryFn: () => invoke<ProfileLog[]>("get_profile_logs", { profilePath: profile.path }),
    queryKey: ["profileLogs", profile.path],
  });

  const activeLog = selected ?? logsQuery.data?.[0]?.path ?? null;

  const logContent = useQuery({
    enabled: activeLog !== null,
    queryFn: () => invoke<string>("read_profile_log", { logPath: activeLog }),
    queryKey: ["profileLog", activeLog],
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="flex-row items-center justify-between border-b">
          <div>
            <SheetTitle>Logs — {profile.name}</SheetTitle>
            <SheetDescription>Game logs written to the profile’s Logs folder.</SheetDescription>
          </div>
          <Button
            aria-label="Refresh logs"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              void logsQuery.refetch();
              void logContent.refetch();
            }}
          >
            <RefreshCw className={logsQuery.isFetching ? "animate-spin" : undefined} />
          </Button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          <div className="w-48 shrink-0 overflow-y-auto border-r">
            {(logsQuery.data ?? []).length === 0 && (
              <p className="text-muted-foreground p-3 text-[11px]">No logs found.</p>
            )}
            {(logsQuery.data ?? []).map((log) => (
              <button
                className={cn(
                  "block w-full truncate border-b px-3 py-2 text-left font-mono text-[11px] transition-colors hover:bg-muted/40",
                  activeLog === log.path && "bg-muted text-foreground",
                )}
                key={log.path}
                onClick={() => setSelected(log.path)}
              >
                {log.name}
                <span className="text-muted-foreground ml-2">
                  {Math.max(1, Math.round(log.size_bytes / 1024))} KB
                </span>
              </button>
            ))}
          </div>
          <ScrollArea scrollFade className="min-h-0 flex-1">
            <pre className="text-muted-foreground p-3 font-mono text-[11px] whitespace-pre-wrap">
              {logContent.isLoading
                ? "Loading…"
                : (logContent.data ?? "Select a log to view its contents.")}
            </pre>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
