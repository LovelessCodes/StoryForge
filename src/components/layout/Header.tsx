import { useLocation } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { PAGE_PATHS } from "@/lib/routes";

import { Button } from "../ui/button";

const pageMeta: Record<string, { title: string; description?: string }> = {
  [PAGE_PATHS.profiles]: {
    title: "Mod Profiles",
    description: "Manage separate mod configurations for different playstyles.",
  },
  [PAGE_PATHS.mods]: { title: "Mods" },
  [PAGE_PATHS.modpacks]: {
    title: "Modpacks",
    description: "Browse community mod collections and install them as profiles.",
  },
  [PAGE_PATHS.versions]: {
    title: "Versions",
    description:
      "Game builds installed on this machine. Profiles launch with one of these versions.",
  },
  [PAGE_PATHS.worlds]: {
    title: "Worlds",
    description: "Browse the worlds of your profiles, launch them, and explore their maps.",
  },
  [PAGE_PATHS.servers]: {
    title: "Servers",
    description:
      "Saved multiplayer servers, the public server browser and your own hosted instances.",
  },
  [PAGE_PATHS.config]: {
    title: "Mod Configs",
    description: "Config files in your active profile.",
  },
  [PAGE_PATHS.news]: {
    title: "News",
    description: "Latest announcements from the Vintage Story forums.",
  },
  [PAGE_PATHS.settings]: {
    title: "Settings",
    description: "Folders, appearance, downloads and the application account.",
  },
  "/auth": {
    title: "Account",
    description: "Sign in to the optional Story Forge cloud for modpacks.",
  },
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { pathname } = useLocation();

  const meta =
    pageMeta[pathname] ??
    (pathname.startsWith("/server-hosting")
      ? {
          title: "Servers",
          description: "Manage saved servers and the dedicated servers you host.",
        }
      : { title: "Story Forge" });

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">{meta.title}</h2>

      {meta.description && (
        <p className="text-muted-foreground truncate text-xs">{meta.description}</p>
      )}

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
