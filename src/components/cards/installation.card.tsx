import { formatDistanceToNow } from "date-fns";
import { BoxIcon, DownloadCloudIcon, PackagePlusIcon, Pencil, Play, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
import { rootTooltipHandle } from "@/routes/__root";
import type { Installation } from "@/stores/installations";

interface InstallationCardProps {
  installation: Installation;
  onPlay: (installation: Installation) => void;
  onUnfavorite: (installation: Installation) => void;
  onEdit: (installation: Installation) => void;
  onAddMods: (installation: Installation) => void;
}

export function InstallationCard({
  installation,
  onPlay,
  onUnfavorite,
  onEdit,
  onAddMods,
}: InstallationCardProps) {
  const { mutate: installVersion, isPending: isInstalling } = useDownloadVersion();

  const versions = useInstalledVersionNames();
  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className={`h-2 w-2 rounded-full ${
            versions.includes(installation.version) ? "bg-success" : "bg-muted-foreground/40"
          }`}
        />
        <TooltipTrigger
          className="flex flex-col justify-start text-left"
          handle={rootTooltipHandle}
          payload={() => (
            <>
              Last played:{" "}
              {installation.lastTimePlayed
                ? formatDistanceToNow(new Date(installation.lastTimePlayed), {
                    addSuffix: true,
                  })
                : "Never"}
            </>
          )}
        >
          <p className="text-foreground font-mono text-sm">{installation.name}</p>
          {installation.version && (
            <p className="text-muted-foreground font-mono text-xs">v{installation.version}</p>
          )}
          {installation.modpackSlug && (
            <p className="text-muted-foreground/60 flex items-center gap-1 font-mono text-xs">
              <BoxIcon className="size-3" />
              {installation.modpackSlug}
              {installation.modpackVersion && <span>v{installation.modpackVersion}</span>}
            </p>
          )}
          <p className="text-muted-foreground font-mono text-xs opacity-60">
            {installation.sizeDisplay ?? "..."}
          </p>
        </TooltipTrigger>
      </div>
      <Group>
        {versions.includes(installation.version) ? (
          <>
            <TooltipTrigger
              render={
                <Button
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                  onClick={() => onPlay(installation)}
                  size="icon"
                  variant="ghost"
                >
                  <Play className="h-4 w-4" />
                  <span className="sr-only">Play {installation.name}</span>
                </Button>
              }
              handle={rootTooltipHandle}
              payload={() => `Play ${installation.name}`}
            />
          </>
        ) : (
          <>
            <TooltipTrigger
              render={
                <Button
                  className="text-muted-foreground hover:text-foreground h-8 w-8 max-md:hidden"
                  disabled={isInstalling}
                  onClick={() => installVersion(installation.version)}
                  size="icon"
                  variant="ghost"
                >
                  <DownloadCloudIcon className="h-4 w-4" />
                  <span className="sr-only">Download version {installation.version}</span>
                </Button>
              }
              handle={rootTooltipHandle}
              payload={() => `Download version ${installation.version}`}
            />
          </>
        )}
        <TooltipTrigger
          render={
            <Button
              className="text-muted-foreground hover:text-foreground h-8 w-8 max-md:hidden"
              onClick={() => onAddMods(installation)}
              size="icon"
              variant="ghost"
            >
              <PackagePlusIcon className="h-4 w-4" />
              <span className="sr-only">Add mods to {installation.name}</span>
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => "Add mods"}
        />
        <TooltipTrigger
          render={
            <Button
              className="text-muted-foreground hover:text-foreground h-8 w-8 max-md:hidden"
              onClick={() => onEdit(installation)}
              size="icon"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit {installation.name}</span>
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => `Edit ${installation.name}`}
        />
        <TooltipTrigger
          render={
            <Button
              className={cn(
                "h-8 w-8 max-md:hidden",
                installation.favorite
                  ? "text-warning"
                  : "hover:text-foreground text-muted-foreground",
              )}
              onClick={() => onUnfavorite(installation)}
              size="icon"
              variant="ghost"
            >
              <Star className={cn("h-4 w-4", installation.favorite && "fill-warning")} />
              <span className="sr-only">
                {installation.favorite ? "Unfavorite" : "Favorite"} {installation.name}
              </span>
            </Button>
          }
          handle={rootTooltipHandle}
          payload={() => (installation.favorite ? "Unfavorite" : "Favorite")}
        />
      </Group>
    </>
  );
}
