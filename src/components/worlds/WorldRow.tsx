import { save } from "@tauri-apps/plugin-dialog";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  Copy,
  Ellipsis,
  FileDown,
  Map as MapIcon,
  Pencil,
  Play,
  Sprout,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayProfile } from "@/hooks/use-play-profile";
import { useBackupWorld } from "@/hooks/use-world-ops";
import { useDateLocale } from "@/lib/i18n/date-locale";
import { toast } from "@/lib/notify";
import type { World } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Profile } from "@/stores/profiles";

import DeleteWorldSheet from "./DeleteWorldSheet";
import DuplicateWorldSheet from "./DuplicateWorldSheet";
import EditWorldSheet from "./EditWorldSheet";
import ViewMapSheet from "./ViewMapSheet";
import { findWorldProfile, worldSaveName } from "./worlds-utils";

interface WorldRowProps {
  world: World;
  profiles: Profile[];
  /** Fallback profile when the world's own profile folder is missing. */
  activeProfile: Profile | null;
}

/** World name and the click-to-copy seed button. */
function WorldRowTitle({
  copied,
  onCopySeed,
  seed,
  world,
}: {
  copied: boolean;
  onCopySeed: () => void;
  seed: string;
  world: World;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm font-medium">{world.data.world_name}</span>
      <button
        className={cn(
          "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
          copied ? "border-success/40 text-success" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={onCopySeed}
        title={t("worlds.row.seedTitle", { seed })}
        type="button"
      >
        <Sprout className="size-3" />
        {copied ? t("worlds.row.copied") : seed}
      </button>
    </div>
  );
}

/** Profile name, game version and last-played line of a world row. */
function WorldRowMeta({
  profile,
  versionMismatch,
  world,
}: {
  profile: Profile | null;
  versionMismatch: boolean;
  world: World;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const data = world.data;
  return (
    <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
      <span title={profile ? profile.path : world.profile_name}>
        {profile ? profile.name : world.profile_name}
      </span>
      {versionMismatch && profile ? (
        <span
          className="text-[var(--color-warning)]"
          title={t("worlds.row.versionMismatchTitle", {
            profileVersion: profile.version,
            worldVersion: data.last_saved_game_version,
          })}
        >
          {t("worlds.row.differentVersion", {
            worldVersion: data.last_saved_game_version,
            profileVersion: profile.version,
          })}
        </span>
      ) : (
        <span className="opacity-60">
          ({data.created_game_version}
          {data.last_saved_game_version &&
          data.last_saved_game_version !== data.created_game_version
            ? ` → ${data.last_saved_game_version}`
            : ""}
          )
        </span>
      )}
      <span>
        {data.last_played
          ? t("worlds.row.lastPlayed", {
              time: formatDistanceToNow(new Date(data.last_played), {
                addSuffix: true,
                locale: dateLocale,
              }),
            })
          : t("common.states.never")}
      </span>
    </div>
  );
}

/** Play/install button plus the map, edit, delete and overflow actions. */
function WorldRowActions({
  downloadPending,
  onBackup,
  onDelete,
  onDuplicate,
  onEdit,
  onInstall,
  onPlay,
  onViewMap,
  playPending,
  profile,
  versionInstalled,
  world,
}: {
  downloadPending: boolean;
  onBackup: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onInstall: (version: string) => void;
  onPlay: () => void;
  onViewMap: () => void;
  playPending: boolean;
  profile: Profile | null;
  versionInstalled: boolean;
  world: World;
}) {
  const { t } = useTranslation();
  const data = world.data;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {profile ? (
        versionInstalled ? (
          <Button
            disabled={playPending}
            onClick={onPlay}
            size="sm"
            title={t("worlds.row.playTitle", { world: data.world_name, profile: profile.name })}
            variant="amber"
          >
            <Play /> {t("common.actions.play")}
          </Button>
        ) : (
          <Button
            disabled={downloadPending}
            onClick={() => onInstall(profile.version)}
            size="sm"
            title={t("worlds.row.installTitle", { version: profile.version })}
            variant="outline"
          >
            <FileDown /> {t("common.actions.install")}
          </Button>
        )
      ) : (
        <Button disabled size="sm" title={t("worlds.row.noProfileTitle")} variant="outline">
          <Play /> {t("worlds.row.noProfile")}
        </Button>
      )}

      <Button
        aria-label={t("worlds.row.viewMapAria")}
        disabled={!world.has_map}
        onClick={onViewMap}
        size="icon-sm"
        title={
          world.has_map
            ? t("worlds.map.view")
            : t("worlds.row.noMapTitle", { name: data.world_name })
        }
        variant="outline"
      >
        <MapIcon className={cn(!world.has_map ? "text-destructive" : "text-info")} />
      </Button>

      <Button
        aria-label={t("worlds.row.editAria")}
        onClick={onEdit}
        size="icon-sm"
        title={t("common.actions.edit")}
        variant="outline"
      >
        <Pencil />
      </Button>

      <Button
        aria-label={t("worlds.row.deleteAria")}
        className="text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        size="icon-sm"
        title={t("common.actions.delete")}
        variant="ghost"
      >
        <Trash2 />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button aria-label={t("worlds.row.actionsAria")} size="icon-sm" variant="ghost" />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy /> {t("worlds.row.duplicate")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!profile} onClick={onBackup}>
            <Archive /> {t("worlds.row.backup")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function WorldRow({ world, profiles, activeProfile }: WorldRowProps) {
  const { t } = useTranslation();
  const installedNames = useInstalledVersionNames();
  const play = usePlayProfile();
  const download = useDownloadVersion();
  const [copiedSeed, copySeed] = useCopyToClipboard();

  const backup = useBackupWorld({
    onError: (error) => {
      toast.error(t("worlds.backup.failed"), { description: error.message });
    },
    onSuccess: () => {
      toast.success(t("worlds.backup.backedUp"));
    },
  });

  const [mapOpen, setMapOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const data = world.data;
  const profile = findWorldProfile(profiles, world) ?? activeProfile;
  const versionInstalled = profile ? installedNames.includes(profile.version) : false;
  const versionMismatch =
    !!profile && !!data.last_saved_game_version && data.last_saved_game_version !== profile.version;

  async function backupWorld() {
    if (!profile) {
      toast.error(t("worlds.backup.noProfile"));
      return;
    }
    const safeName = data.world_name.replace(/[\\/:*?"<>|]/g, "_");
    const path = await save({
      defaultPath: `${safeName}.sfworld.zip`,
      filters: [{ name: t("worlds.backup.filterName"), extensions: ["zip"] }],
    });
    if (!path || Array.isArray(path)) return;
    backup.mutate({ profileId: profile.id, worldPath: world.path, destPath: path });
  }

  const seed = String(data.seed);
  const copied = copiedSeed === seed;

  function playWorld() {
    if (!profile) return;
    play.mutate({ id: profile.id, save: worldSaveName(world) });
  }

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <div className="min-w-0 flex-1">
        <WorldRowTitle
          copied={copied}
          onCopySeed={() => copySeed(seed)}
          seed={seed}
          world={world}
        />
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          <Trans
            components={{ author: <span className="text-[var(--color-warning)]" /> }}
            i18nKey="worlds.row.byline"
            values={{
              author: data.created_by_player_name,
              version: data.created_game_version,
            }}
          />
        </p>
        <WorldRowMeta profile={profile} versionMismatch={versionMismatch} world={world} />
      </div>

      <WorldRowActions
        downloadPending={download.isPending}
        onBackup={() => void backupWorld()}
        onDelete={() => setDeleteOpen(true)}
        onDuplicate={() => setDuplicateOpen(true)}
        onEdit={() => setEditOpen(true)}
        onInstall={(version) => download.mutate(version)}
        onPlay={playWorld}
        onViewMap={() => setMapOpen(true)}
        playPending={play.isPending}
        profile={profile}
        versionInstalled={versionInstalled}
        world={world}
      />

      <DuplicateWorldSheet
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
        profiles={profiles}
        world={world}
      />

      <ViewMapSheet open={mapOpen} onOpenChange={setMapOpen} world={world} />
      <EditWorldSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        profiles={profiles}
        world={world}
      />
      <DeleteWorldSheet open={deleteOpen} onOpenChange={setDeleteOpen} world={world} />
    </div>
  );
}
