import { Link, useLocation } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Earth,
  FileDown,
  FileText,
  FolderOpen,
  IdCard,
  Layers,
  LayoutDashboard,
  Loader2,
  Newspaper,
  Package,
  Play,
  Server,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { openProfilesFolderInFileExplorer } from "@/lib/app-paths";
import { errorMessage } from "@/lib/errors";
import { PAGE_PATHS, type RoutePage } from "@/lib/routes";

import { useActiveProfile } from "../../hooks/use-active-profile";
import { useAppVersion } from "../../hooks/use-app-version";
import { useDownloadVersion } from "../../hooks/use-download-version";
import { useInstalledVersions } from "../../hooks/use-installed-versions";
import { usePlayProfile } from "../../hooks/use-play-profile";
import { useDownloadStore } from "../../stores/downloads";
import type { Profile } from "../../stores/profiles";
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
import { notify } from "../ui/toast-manager";
import { DiscordIcon } from "./DiscordIcon";

/** Sidebar entries; labels come from `layout.nav.<page>`. */
interface NavItem {
  page: RoutePage;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { page: "dashboard", icon: LayoutDashboard },
  { page: "profiles", icon: IdCard },
  { page: "mods", icon: Package },
  { page: "modpacks", icon: Layers },
  { page: "versions", icon: Boxes },
  { page: "worlds", icon: Earth },
  { page: "servers", icon: Server },
  { page: "config", icon: FileText },
  { page: "news", icon: Newspaper },
  { page: "settings", icon: Settings },
];

/** Whether `page` is the section the given `pathname` belongs to. */
function isActivePage(pathname: string, page: RoutePage) {
  if (page === "servers") {
    return pathname.startsWith("/servers") || pathname.startsWith("/server-hosting");
  }
  const path = PAGE_PATHS[page];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Status of the active profile's game-version download, as the footer shows it. */
interface DownloadButtonState {
  paused: boolean;
  inProgress: boolean;
  percent: number | null;
}

/** Tooltip of the footer's download button. */
function downloadButtonTitle(t: TFunction, profile: Profile | null, paused: boolean) {
  if (!profile) return t("layout.sidebar.createProfileFirst");
  if (paused) return t("layout.sidebar.pausedTitle", { version: profile.version });
  return t("layout.sidebar.downloadTitle", { version: profile.version, name: profile.name });
}

/** Label of the footer's download button, mirroring the download status. */
function downloadButtonLabel(t: TFunction, profile: Profile | null, state: DownloadButtonState) {
  if (!profile) return t("common.actions.play");
  if (state.paused) return t("layout.sidebar.downloadPaused");
  if (!state.inProgress) return t("layout.sidebar.downloadVersion", { version: profile.version });
  if (state.percent === null) return t("layout.sidebar.downloadingNoPercent");
  return t("layout.sidebar.downloading", { percent: state.percent.toFixed(0) });
}

/** Brand block: logo, app version and tagline. */
function SidebarBrand() {
  const { t } = useTranslation();
  const { data: version } = useAppVersion();

  return (
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
          {t("layout.sidebar.tagline")}
        </span>
      </div>
    </div>
  );
}

/** Launch button for a profile whose game version is installed. */
function SidebarPlayButton({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const play = usePlayProfile();

  return (
    <Button
      variant="amber"
      className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
      onClick={() => play.mutate({ id: profile.id })}
      disabled={play.isPending}
      title={t("layout.sidebar.launchTitle", { name: profile.name })}
    >
      <Play />
      <span className="group-data-[collapsible=icon]:hidden">
        {t("layout.sidebar.play", { name: profile.name })}
      </span>
    </Button>
  );
}

/** Download button for the active profile's game version. */
function SidebarDownloadButton({ profile }: { profile: Profile | null }) {
  const { t } = useTranslation();
  const download = useDownloadVersion();
  const downloadEntry = useDownloadStore((s) => (profile ? s.entries[profile.version] : undefined));

  const downloadInProgress =
    downloadEntry !== undefined &&
    downloadEntry.status !== "done" &&
    downloadEntry.status !== "error";
  const state: DownloadButtonState = {
    paused: downloadEntry?.status === "paused",
    inProgress: downloadInProgress,
    percent: downloadEntry?.percent ?? null,
  };

  return (
    <Button
      variant="outline"
      className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
      onClick={() => profile && download.mutate(profile.version)}
      disabled={!profile || download.isPending || downloadInProgress || state.paused}
      title={downloadButtonTitle(t, profile, state.paused)}
    >
      {downloadInProgress ? <Loader2 className="animate-spin" /> : <FileDown />}
      <span className="group-data-[collapsible=icon]:hidden">
        {downloadButtonLabel(t, profile, state)}
      </span>
    </Button>
  );
}

/** Footer action: play when the profile's version is installed, download otherwise. */
function SidebarProfileAction() {
  const { activeProfile } = useActiveProfile();
  const { data: installedVersions } = useInstalledVersions();

  const versionInstalled =
    activeProfile !== null &&
    (installedVersions ?? []).some((v) => v.name === activeProfile.version);

  if (activeProfile && versionInstalled) {
    return <SidebarPlayButton profile={activeProfile} />;
  }
  return <SidebarDownloadButton profile={activeProfile} />;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  return (
    <SidebarRoot collapsible="icon">
      <SidebarHeader className="pt-8 select-none" data-tauri-drag-region>
        <SidebarBrand />
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
          <SidebarGroupLabel>{t("layout.sidebar.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                const label = t(`layout.nav.${item.page}`);
                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={isActivePage(pathname, item.page)}
                      tooltip={label}
                      render={<Link to={PAGE_PATHS[item.page]} />}
                    >
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarProfileAction />
        <Button
          variant="outline"
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          onClick={() => {
            void openProfilesFolderInFileExplorer().catch((err) => {
              notify("profiles-folder", { type: "error", title: errorMessage(err) });
            });
          }}
          title={t("layout.sidebar.openProfilesFolderTitle")}
        >
          <FolderOpen />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("common.actions.openFolder")}
          </span>
        </Button>
        <Button
          variant="outline"
          className="w-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          onClick={() => void openUrl("https://discord.gg/gByx63peUC")}
          title={t("layout.sidebar.discord")}
        >
          <DiscordIcon className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("layout.sidebar.discord")}
          </span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </SidebarRoot>
  );
}
