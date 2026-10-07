import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
            <SheetTitle>{t("profiles.logs.title", { name: profile.name })}</SheetTitle>
            <SheetDescription>{t("profiles.logs.description")}</SheetDescription>
          </div>
          <Button
            aria-label={t("profiles.logs.refresh")}
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
              <p className="text-muted-foreground p-3 text-[11px]">{t("profiles.logs.empty")}</p>
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
                ? t("common.states.loading")
                : (logContent.data ?? t("profiles.logs.select"))}
            </pre>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
