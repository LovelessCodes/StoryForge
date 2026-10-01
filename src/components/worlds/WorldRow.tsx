import { formatDistanceToNow } from "date-fns";
import { FileDown, Map as MapIcon, Pencil, Play, Sprout, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { usePlayProfile } from "@/hooks/use-play-profile";
import type { World } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Profile } from "@/stores/profiles";

import DeleteWorldSheet from "./DeleteWorldSheet";
import EditWorldSheet from "./EditWorldSheet";
import ViewMapSheet from "./ViewMapSheet";
import { findWorldProfile, worldSaveName } from "./worlds-utils";

interface WorldRowProps {
  world: World;
  profiles: Profile[];
  /** Fallback profile when the world's own profile folder is missing. */
  activeProfile: Profile | null;
}

export default function WorldRow({ world, profiles, activeProfile }: WorldRowProps) {
  const installedNames = useInstalledVersionNames();
  const play = usePlayProfile();
  const download = useDownloadVersion();
  const [copiedSeed, copySeed] = useCopyToClipboard();

  const [mapOpen, setMapOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const data = world.data;
  const profile = findWorldProfile(profiles, world) ?? activeProfile;
  const versionInstalled = profile ? installedNames.includes(profile.version) : false;
  const versionMismatch =
    !!profile && !!data.last_saved_game_version && data.last_saved_game_version !== profile.version;

  const seed = String(data.seed);
  const copied = copiedSeed === seed;

  function playWorld() {
    if (!profile) return;
    play.mutate({ id: profile.id, save: worldSaveName(world) });
  }

  return (
    <div className="bg-card hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{data.world_name}</span>
          <button
            className={cn(
              "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
              copied
                ? "border-success/40 text-success"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => copySeed(seed)}
            title={`Seed ${seed} — click to copy`}
            type="button"
          >
            <Sprout className="size-3" />
            {copied ? "Copied!" : seed}
          </button>
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          by <span className="text-[var(--color-warning)]">{data.created_by_player_name}</span> in{" "}
          {data.created_game_version}
        </p>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          <span title={profile ? profile.path : world.profile_name}>
            {profile ? profile.name : world.profile_name}
          </span>
          {versionMismatch && profile ? (
            <span
              className="text-[var(--color-warning)]"
              title={`The profile version (${profile.version}) differs from the world's last saved version (${data.last_saved_game_version}).`}
            >
              Different version {data.last_saved_game_version} → {profile.version}
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
            Last played:{" "}
            {data.last_played
              ? formatDistanceToNow(new Date(data.last_played), { addSuffix: true })
              : "Never"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {profile ? (
          versionInstalled ? (
            <Button
              disabled={play.isPending}
              onClick={playWorld}
              size="sm"
              title={`Play ${data.world_name} with ${profile.name}`}
              variant="amber"
            >
              <Play /> Play
            </Button>
          ) : (
            <Button
              disabled={download.isPending}
              onClick={() => download.mutate(profile.version)}
              size="sm"
              title={`Game version ${profile.version} is not installed`}
              variant="outline"
            >
              <FileDown /> Install {profile.version}
            </Button>
          )
        ) : (
          <Button disabled size="sm" title="No matching profile found" variant="outline">
            <Play /> No profile
          </Button>
        )}

        <Button
          aria-label="View map"
          disabled={!world.has_map}
          onClick={() => setMapOpen(true)}
          size="icon-sm"
          title={world.has_map ? "View Map" : `No map available for ${data.world_name}`}
          variant="outline"
        >
          <MapIcon className={cn(!world.has_map ? "text-destructive" : "text-info")} />
        </Button>

        <Button
          aria-label="Edit world"
          onClick={() => setEditOpen(true)}
          size="icon-sm"
          title="Edit"
          variant="outline"
        >
          <Pencil />
        </Button>

        <Button
          aria-label="Delete world"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          size="icon-sm"
          title="Delete"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>

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
