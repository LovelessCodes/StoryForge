import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Earth,
  FileDown,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  Newspaper,
  Package,
  Play,
  Server,
  Settings,
  User,
} from "lucide-react";

import { openProfilesFolderInFileExplorer } from "@/lib/app-paths";
import { PAGE_PATHS, type RoutePage } from "@/lib/routes";

import { useActiveProfile } from "../../hooks/use-active-profile";
import { useAppVersion } from "../../hooks/use-app-version";
import { useDownloadVersion } from "../../hooks/use-download-version";
import { useInstalledVersions } from "../../hooks/use-installed-versions";
import { usePlayProfile } from "../../hooks/use-play-profile";
import { useDownloadStore } from "../../stores/downloads";
import AccountMenu from "../accounts/AccountMenu";
import ProfileSelector from "../profiles/ProfileSelector";
import { Button } from "../ui/button";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "../ui/sidebar";
import { notify } from "../ui/toast";

interface NavItem {
  page: RoutePage;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { page: "profiles", label: "Profiles", icon: User },
  { page: "mods", label: "Mods", icon: Package },
  { page: "modpacks", label: "Modpacks", icon: Layers },
  { page: "versions", label: "Versions", icon: Boxes },
  { page: "worlds", label: "Worlds", icon: Earth },
  { page: "servers", label: "Servers", icon: Server },
  { page: "config", label: "Mod Configs", icon: FileText },
  { page: "news", label: "News", icon: Newspaper },
  { page: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const { data: version } = useAppVersion();
  const { activeProfile } = useActiveProfile();
  const play = usePlayProfile();
  const download = useDownloadVersion();
  const { data: installedVersions } = useInstalledVersions();
  const downloadEntry = useDownloadStore((s) =>
    activeProfile ? s.entries[activeProfile.version] : undefined,
  );

  const versionInstalled =
    activeProfile !== null &&
    (installedVersions ?? []).some((v) => v.name === activeProfile.version);

  const downloadInProgress =
    downloadEntry !== undefined &&
    downloadEntry.status !== "done" &&
    downloadEntry.status !== "error";
  const downloadPaused = downloadEntry?.status === "paused";
  const downloadPercent = downloadEntry?.percent ?? null;

  function isActive(page: RoutePage) {
    if (page === "servers") {
      return pathname.startsWith("/servers") || pathname.startsWith("/server-hosting");
    }
    const path = PAGE_PATHS[page];
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  const playTitle = !activeProfile ? "Create a profile first" : `Launch ${activeProfile.name}`;

  const downloadTitle = !activeProfile
    ? "Create a profile first"
    : downloadPaused
      ? `Game version ${activeProfile.version} download is paused — resume it on the Versions page`
      : `Download game version ${activeProfile.version} to play ${activeProfile.name}`;

  const downloadLabel = !activeProfile
    ? "Play"
    : downloadPaused
      ? "Download paused"
      : downloadInProgress
        ? `Downloading…${downloadPercent !== null ? ` ${downloadPercent.toFixed(0)}%` : ""}`
        : `Download v${activeProfile.version}`;

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="pt-8 select-none" data-tauri-drag-region>
        <div className="pointer-events-none flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <img src="/StoryForge.png" alt="Story Forge" className="size-8 shrink-0 object-contain" />
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-bold tracking-wide">STORY FORGE</span>
              {version && (
                <span className="text-muted-foreground text-[10px] font-medium">v{version}</span>
              )}
            </span>
            <span className="truncate text-[10px] font-medium tracking-widest text-[var(--color-accent-amber)] uppercase">
              Vintage Story Manager
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent className="grid gap-2">
          <ProfileSelector />
          <AccountMenu />
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={isActive(item.page)}
                      tooltip={item.label}
                      render={<Link to={PAGE_PATHS[item.page]} />}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {activeProfile && versionInstalled ? (
          <Button
            variant="amber"
            className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
            onClick={() => play.mutate({ id: activeProfile.id })}
            disabled={play.isPending}
            title={playTitle}
          >
            <Play />
            <span className="group-data-[collapsible=icon]:hidden">Play {activeProfile.name}</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
            onClick={() => activeProfile && download.mutate(activeProfile.version)}
            disabled={!activeProfile || download.isPending || downloadInProgress || downloadPaused}
            title={downloadTitle}
          >
            {downloadInProgress ? <Loader2 className="animate-spin" /> : <FileDown />}
            <span className="group-data-[collapsible=icon]:hidden">{downloadLabel}</span>
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          onClick={() => {
            void openProfilesFolderInFileExplorer().catch((err) => {
              notify("profiles-folder", { type: "error", title: String(err) });
            });
          }}
          title="Open the profiles folder"
        >
          <FolderOpen />
          <span className="group-data-[collapsible=icon]:hidden">Open Folder</span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  );
}
