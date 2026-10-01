import { useLocation } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { PAGE_PATHS } from "@/lib/routes";

import { Button } from "../ui/button";

const pageTitles: Record<string, string> = {
  [PAGE_PATHS.profiles]: "Profiles",
  [PAGE_PATHS.mods]: "Mods",
  [PAGE_PATHS.modpacks]: "Modpacks",
  [PAGE_PATHS.versions]: "Versions",
  [PAGE_PATHS.worlds]: "Worlds",
  [PAGE_PATHS.servers]: "Servers",
  [PAGE_PATHS.config]: "Mod Configs",
  [PAGE_PATHS.news]: "News",
  [PAGE_PATHS.settings]: "Settings",
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { pathname } = useLocation();

  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/server-hosting") ? "Server Details" : "Story Forge");

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">{title}</h2>

      <div className="flex-1" />

      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh"
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      )}
    </header>
  );
}
