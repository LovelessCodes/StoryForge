import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import {
  DownloadCloud,
  Ellipsis,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plug,
  Star,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConnectToServer } from "@/hooks/use-connect-to-server";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { useRemoveServerFromProfile } from "@/hooks/use-remove-server-from-profile";
import { useRevealInFolder } from "@/hooks/use-reveal-in-folder";
import { useServerStatus } from "@/hooks/use-server-status";
import { toast } from "@/lib/notify";
import { findProfileForServer, useProfiles } from "@/stores/profiles";
import { useServerStore, type Server } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";

import { serverAddress, serverEntryString } from "./server-utils";

interface ServerRowProps {
  server: Server;
  onEdit: (server: Server) => void;
}

export default function ServerRow({ server, onEdit }: ServerRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleFavorite = useServerStore((s) => s.toggleFavorite);
  const loadServers = useServerStore((s) => s.loadServers);
  const streamMode = useSettingsStore((s) => s.streamMode);
  const setActiveProfileId = useSettingsStore((s) => s.setActiveProfileId);
  const { profiles } = useProfiles();
  const profile = findProfileForServer(profiles, server.profileId, server.profileName);
  const installedVersions = useInstalledVersionNames();
  const versionInstalled = Boolean(profile && installedVersions.includes(profile.version));
  const { isChecking, isOnline } = useServerStatus(server);
  const connectToServer = useConnectToServer();
  const downloadVersion = useDownloadVersion();
  const revealInFolder = useRevealInFolder();
  const removeServerFromProfile = useRemoveServerFromProfile();

  const [deleteOpen, setDeleteOpen] = useState(false);

  const address = serverAddress(server);
  const hasPassword = server.password.length > 0;

  function connect() {
    if (versionInstalled && profile) {
      connectToServer.mutate({
        name: server.name,
        ip: address,
        password: server.password,
        profileId: profile.id,
      });
      return;
    }
    if (profile?.version) downloadVersion.mutate(profile.version);
  }

  function openProfileFolder(kind: "mods" | "config") {
    if (!profile) return;
    setActiveProfileId(profile.id);
    void navigate({ to: kind === "mods" ? "/mods" : "/config" });
  }

  function doDelete() {
    removeServerFromProfile.mutate(
      {
        profileId: server.profileId,
        server: serverEntryString(server),
      },
      {
        onError: (error) => {
          toast.error(t("servers.row.removeFailed", { error: error.message }), {
            id: `server-remove-${server.id}`,
          });
        },
        onSuccess: async () => {
          await loadServers();
          setDeleteOpen(false);
        },
      },
    );
  }

  const busy = connectToServer.isPending || downloadVersion.isPending;

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <div className="flex shrink-0 items-center">
        {isChecking ? (
          <Wifi
            className="text-muted-foreground/40 size-3"
            aria-label={t("servers.row.checkingAria")}
          />
        ) : isOnline ? (
          <Wifi className="text-success size-3" aria-label={t("servers.row.onlineAria")} />
        ) : (
          <WifiOff
            className="text-destructive size-3"
            aria-label={t("servers.row.unreachableAria")}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{server.name}</span>
          {hasPassword && <Lock className="text-muted-foreground size-3 shrink-0" />}
          {server.favorite && (
            <Star className="size-3 shrink-0 fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]" />
          )}
        </div>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          <span className={cn("font-mono", !streamMode && "text-[var(--color-warning)]")}>
            {streamMode ? t("servers.row.hidden") : address}
          </span>
          <span>
            {t("servers.row.via", {
              name: profile?.name ?? server.profileName ?? t("servers.row.unknownProfile"),
            })}
          </span>
          {profile?.version && <span>v{profile.version}</span>}
          {!versionInstalled && (
            <span className="text-[var(--color-warning)]">{t("servers.row.notInstalled")}</span>
          )}
        </div>
      </div>

      <Button
        size="sm"
        variant={versionInstalled ? "outline-success" : "outline"}
        disabled={busy || !profile}
        onClick={connect}
        title={
          versionInstalled
            ? t("servers.row.connectTitle", { name: server.name })
            : t("servers.row.downloadTitle", {
                version: profile?.version ?? t("common.states.unknown"),
              })
        }
      >
        {versionInstalled ? <Plug /> : <DownloadCloud />}
        {versionInstalled ? t("servers.actions.connect") : t("servers.actions.download")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("servers.row.actionsAria", { name: server.name })}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={connect} disabled={busy}>
            {versionInstalled ? <Plug /> : <DownloadCloud />}
            {versionInstalled ? t("servers.actions.connect") : t("servers.actions.downloadVersion")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleFavorite(server.rowKey)}>
            <Star className={cn(server.favorite && "text-warning fill-warning")} />
            {server.favorite ? t("servers.row.unfavorite") : t("servers.row.favorite")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!profile} onClick={() => openProfileFolder("mods")}>
            <Package /> {t("servers.row.manageMods")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!profile} onClick={() => openProfileFolder("config")}>
            <FileText /> {t("servers.row.configureMods")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!profile}
            onClick={() => profile && revealInFolder.mutate(profile.path)}
          >
            <FolderOpen /> {t("servers.row.openProfileFolder")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(server)}>
            <Pencil /> {t("common.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> {t("common.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet
        open={deleteOpen}
        onOpenChange={(next) => !removeServerFromProfile.isPending && setDeleteOpen(next)}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>{t("servers.row.deleteTitle", { name: server.name })}</SheetTitle>
            <SheetDescription>
              {t("servers.row.deleteDescription", {
                profile: profile?.name ?? server.profileName,
              })}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <Badge variant="outline" className="font-mono">
              {serverEntryString(server)}
            </Badge>
          </div>
          <SheetFooter className="border-t">
            <Button
              disabled={removeServerFromProfile.isPending}
              variant="destructive"
              onClick={doDelete}
            >
              {removeServerFromProfile.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> {t("servers.row.deleting")}
                </>
              ) : (
                t("servers.row.deleteSubmit")
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
