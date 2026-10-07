import { Link } from "@tanstack/react-router";
import { FolderInput, IdCard, Play, Server, Star } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { usePlayProfile } from "@/hooks/use-play-profile";
import { useProfiles } from "@/stores/profiles";
import { useServerStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

import { PROFILE_ICON_BASE } from "../profiles/ProfileIconPicker";

/**
 * Landing page: the profiles and saved servers of the active profile, with
 * play and connect one click away. The page is a compact shortcut into
 * Profiles and Servers, which hold the full management actions.
 */
export default function DashboardPage() {
  const { t } = useTranslation();
  const { profiles, loadProfiles, toggleFavorite } = useProfiles();
  const { activeProfile } = useActiveProfile();
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const play = usePlayProfile();
  const servers = useServerStore((s) => s.servers);
  const loadServers = useServerStore((s) => s.loadServers);
  const toggleFavoriteServer = useServerStore((s) => s.toggleFavorite);
  const connect = useConnectToServer();

  useEffect(() => {
    if (profiles.length === 0) void loadProfiles();
    void loadServers();
    // Load once on mount: the stores are shared with their own pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="grid content-start gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">
            {t("dashboard.profiles", { count: profiles.length })}
          </h3>
          <Button size="sm" variant="outline" render={<Link to="/profiles" />}>
            {t("dashboard.viewAll")}
          </Button>
        </div>

        {profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-8 text-center">
            <FolderInput className="text-muted-foreground size-5" />
            <p className="text-muted-foreground text-xs">{t("dashboard.emptyProfiles")}</p>
            <Button size="sm" variant="accent-primary" render={<Link to="/profiles" />}>
              {t("dashboard.createProfile")}
            </Button>
          </div>
        ) : (
          <div className="divide-y border">
            {profiles.map((profile) => {
              const isActive = activeProfile?.id === profile.id;
              return (
                <div
                  className="hover:bg-muted/40 flex items-center gap-3 p-2.5 transition-colors"
                  key={profile.id}
                >
                  <button
                    aria-label={t("dashboard.setActive", { name: profile.name })}
                    className="bg-muted flex size-8 shrink-0 cursor-pointer items-center justify-center border"
                    onClick={() => setActiveProfileId(profile.id)}
                    type="button"
                  >
                    {profile.icon ? (
                      <img
                        alt=""
                        className="size-6 object-contain"
                        src={`${PROFILE_ICON_BASE}/${profile.icon}`}
                      />
                    ) : (
                      <IdCard className="text-muted-foreground size-4" />
                    )}
                  </button>
                  <button
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    onClick={() => setActiveProfileId(profile.id)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{profile.name}</span>
                      {isActive && (
                        <span className="text-accent-primary shrink-0 text-[10px] font-semibold tracking-wide uppercase">
                          {t("dashboard.active")}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground block font-mono text-[10px]">
                      {profile.version || "—"} · {profile.sizeDisplay}
                    </span>
                  </button>
                  <Button
                    aria-label={
                      profile.favorite
                        ? t("dashboard.unfavorite", { name: profile.name })
                        : t("dashboard.favorite", { name: profile.name })
                    }
                    onClick={() => toggleFavorite(profile.id)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Star
                      className={
                        profile.favorite
                          ? "fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]"
                          : undefined
                      }
                    />
                  </Button>
                  <Button
                    disabled={play.isPending}
                    onClick={() => {
                      setActiveProfileId(profile.id);
                      play.mutate({ id: profile.id });
                    }}
                    size="sm"
                    variant="amber"
                  >
                    <Play />
                    {t("common.actions.play")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid content-start gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">
            {t("dashboard.servers", { count: servers.length })}
          </h3>
          <Button size="sm" variant="outline" render={<Link to="/servers" />}>
            {t("dashboard.viewAll")}
          </Button>
        </div>

        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-8 text-center">
            <Server className="text-muted-foreground size-5" />
            <p className="text-muted-foreground text-xs">{t("dashboard.emptyServers")}</p>
            <Button size="sm" variant="accent-primary" render={<Link to="/servers" />}>
              {t("dashboard.browseServers")}
            </Button>
          </div>
        ) : (
          <div className="divide-y border">
            {servers.map((server) => (
              <div
                className="hover:bg-muted/40 flex items-center gap-3 p-2.5 transition-colors"
                key={server.rowKey}
              >
                <Server className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{server.name}</span>
                  <span className="text-muted-foreground block font-mono text-[10px]">
                    {server.ip}
                    {server.port ? `:${server.port}` : ""} · {server.profileName}
                  </span>
                </div>
                <Button
                  aria-label={
                    server.favorite
                      ? t("servers.row.unfavorite", { name: server.name })
                      : t("servers.row.favorite", { name: server.name })
                  }
                  onClick={() => toggleFavoriteServer(server.rowKey)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Star
                    className={
                      server.favorite
                        ? "fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]"
                        : undefined
                    }
                  />
                </Button>
                <Button
                  disabled={connect.isPending}
                  onClick={() =>
                    connect.mutate({
                      ip: server.ip,
                      name: server.name,
                      password: server.password,
                      profileId: server.profileId,
                    })
                  }
                  size="sm"
                  variant="amber"
                >
                  {t("dashboard.connect")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
