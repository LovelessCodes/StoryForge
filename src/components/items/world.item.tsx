import { invoke } from "@tauri-apps/api/core";
import { formatDistanceToNow } from "date-fns";
import { DownloadCloudIcon, MapIcon, PenIcon, PlayIcon, SproutIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { DeleteWorldDialog } from "@/components/dialogs/deleteworld.dialog";
import { EditWorldDialog } from "@/components/dialogs/editworld.dialog";
import { ViewMapDialog } from "@/components/dialogs/viewmap.dialog";
import { AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Group, GroupSeparator } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootAlertDialogHandle, rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import type { World } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

export const WorldItem = ({ world }: { world: World }) => {
  const { installations } = useInstallations();
  const versions = useInstalledVersionNames();
  const [copiedText, copyToClipboard] = useCopyToClipboard();
  const worldData = world.data;
  const installation = installations.find(
    (installation) => installation.path.split("/").pop() === world.installation_name,
  );
  const version = versions?.find((v) => v === installation?.version);
  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();
  if (!installation) return null;
  if (!worldData) return null;
  return (
    <div className="grid w-full grid-cols-3 items-center justify-between">
      <div className="flex flex-col">
        <p className="text-sm">
          {worldData.world_name}
          <TooltipTrigger
            className={cn([
              "ml-2 text-xs opacity-50 cursor-pointer",
              worldData.seed.toString() === copiedText && "text-success",
            ])}
            onClick={() => copyToClipboard(worldData.seed.toString())}
            handle={rootTooltipHandle}
            payload={() => (
              <>
                Seed: {worldData.seed}
                {worldData.seed.toString() === copiedText ? (
                  <span className="text-success">Copied!</span>
                ) : (
                  <span className="text-muted-foreground text-xs">Click to copy</span>
                )}
              </>
            )}
          >
            <SproutIcon className="inline size-4" />
          </TooltipTrigger>
        </p>
        <p className="text-muted-foreground text-xs">
          by <span className="text-warning-foreground">{worldData.created_by_player_name}</span>
          <span className="text-muted-foreground"> in {worldData.created_game_version}</span>
        </p>
      </div>
      <div className="flex flex-col">
        <p className="text-muted-foreground text-sm">
          {installation.name}{" "}
          {worldData.last_saved_game_version &&
          worldData.last_saved_game_version !== installation.version ? (
            <TooltipTrigger
              handle={rootTooltipHandle}
              payload={() => (
                <>
                  The installation version ({installation.version}) is different from the world's
                  created version ({worldData.created_game_version}) or the last saved version (
                  {worldData.last_saved_game_version}).
                </>
              )}
            >
              <span className="text-warning-foreground text-xs opacity-50">
                (Different Version {worldData.last_saved_game_version} → {installation.version})
              </span>
            </TooltipTrigger>
          ) : (
            <span className="text-xs opacity-50">
              ({worldData.created_game_version}
              {worldData.last_saved_game_version !== worldData.created_game_version
                ? ` → ${worldData.last_saved_game_version}`
                : ""}
              )
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          Last played:{" "}
          {worldData.last_played
            ? formatDistanceToNow(new Date(worldData.last_played), {
                addSuffix: true,
              })
            : "Never"}
        </p>
      </div>
      <Group className="w-full justify-end">
        <TooltipTrigger
          render={
            <Button
              disabled={isInstalling}
              onClick={async () => {
                if (version) {
                  const { useSystemDotnet } = useSettingsStore.getState();
                  await invoke("play_game", {
                    options: {
                      installation_id: installation.id,
                      save: world.path.split("/").pop()?.replace(".vcdbs", ""),
                      use_system_dotnet: useSystemDotnet,
                    },
                  });
                  toast.success(`Launching ${installation.name} on ${worldData.world_name}...`);
                } else {
                  installVersion(installation.version);
                }
              }}
              variant="outline"
            >
              {version ? (
                <PlayIcon aria-hidden="true" className="text-success -ms-1 opacity-60" size={16} />
              ) : (
                <DownloadCloudIcon
                  aria-hidden="true"
                  className="text-warning-foreground -ms-1 opacity-60"
                  size={16}
                />
              )}
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (version ? "Play" : `Install ${installation.version}`)}
        />
        <TooltipTrigger
          render={
            <Button
              disabled={!world.has_map}
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <ViewMapDialog world={world} />}
                />
              }
              variant="outline"
            >
              <MapIcon
                aria-hidden="true"
                className={cn(
                  "-ms-1 opacity-60",
                  !world.has_map ? "text-destructive" : "text-blue-300",
                )}
                size={16}
              />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() =>
            world.has_map ? "View Map" : `No Map Available for ${worldData.world_name}`
          }
        />
        <TooltipTrigger
          render={
            <Button
              render={
                <DialogTrigger
                  handle={rootDialogHandle}
                  payload={() => <EditWorldDialog world={world} />}
                />
              }
              variant="outline"
            >
              <PenIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Edit"}
        />
        <GroupSeparator />
        <TooltipTrigger
          render={
            <Button
              aria-label="Delete"
              render={
                <AlertDialogTrigger
                  handle={rootAlertDialogHandle}
                  payload={() => <DeleteWorldDialog world={world} />}
                />
              }
              size="icon"
              variant="outline"
            >
              <TrashIcon aria-hidden="true" className="opacity-60" size={16} />
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Delete"}
        />
      </Group>
    </div>
  );
};
