import { formatDistanceToNow } from "date-fns";
import { DownloadCloudIcon, PackagePlusIcon, Pencil, Play, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group, GroupItem } from "@/components/ui/group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import { cn } from "@/lib/utils";
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

  const { data: versions } = useInstalledVersions();
  return (
    <>
      <div className="flex items-center gap-3">
        <div
          className={`h-2 w-2 rounded-full ${
            versions.includes(installation.version) ? "bg-success" : "bg-muted-foreground/40"
          }`}
        />
        <Tooltip>
          <TooltipTrigger className="flex flex-col justify-start text-left">
            <p className="text-foreground font-mono text-sm">{installation.name}</p>
            {installation.version && (
              <p className="text-muted-foreground font-mono text-xs">v{installation.version}</p>
            )}
            <p className="text-muted-foreground font-mono text-xs opacity-60">
              {installation.sizeDisplay ?? "..."}
            </p>
          </TooltipTrigger>
          <TooltipContent>
            Last played:{" "}
            {installation.lastTimePlayed
              ? formatDistanceToNow(new Date(installation.lastTimePlayed), {
                  addSuffix: true,
                })
              : "Never"}
          </TooltipContent>
        </Tooltip>
      </div>
      <Group>
        <Tooltip>
          {versions.includes(installation.version) ? (
            <>
              <TooltipTrigger
                render={
                  <GroupItem
                    render={
                      <Button
                        className="text-muted-foreground hover:text-foreground h-8 w-8"
                        onClick={() => onPlay(installation)}
                        size="icon"
                        variant="ghost"
                      />
                    }
                  >
                    <Play className="h-4 w-4" />
                    <span className="sr-only">Play {installation.name}</span>
                  </GroupItem>
                }
              />
              <TooltipContent>Play {installation.name}</TooltipContent>
            </>
          ) : (
            <>
              <TooltipTrigger
                render={
                  <GroupItem
                    render={
                      <Button
                        className="text-muted-foreground hover:text-foreground h-8 w-8"
                        disabled={isInstalling}
                        onClick={() => installVersion(installation.version)}
                        size="icon"
                        variant="ghost"
                      />
                    }
                  >
                    <DownloadCloudIcon className="h-4 w-4" />
                    <span className="sr-only">Download version {installation.version}</span>
                  </GroupItem>
                }
              />
              <TooltipContent>Download version {installation.version}</TooltipContent>
            </>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    onClick={() => onAddMods(installation)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <PackagePlusIcon className="h-4 w-4" />
                <span className="sr-only">Add mods to {installation.name}</span>
              </GroupItem>
            }
          />
          <TooltipContent>Add mods</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className="text-muted-foreground hover:text-foreground h-8 w-8"
                    onClick={() => onEdit(installation)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit {installation.name}</span>
              </GroupItem>
            }
          />
          <TooltipContent>Edit {installation.name}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <GroupItem
                render={
                  <Button
                    className={cn(
                      "h-8 w-8",
                      installation.favorite
                        ? "text-warning"
                        : "hover:text-foreground text-muted-foreground",
                    )}
                    onClick={() => onUnfavorite(installation)}
                    size="icon"
                    variant="ghost"
                  />
                }
              >
                <Star className={cn("h-4 w-4", installation.favorite && "fill-warning")} />
                <span className="sr-only">
                  {installation.favorite ? "Unfavorite" : "Favorite"} {installation.name}
                </span>
              </GroupItem>
            }
          />
          <TooltipContent>{installation.favorite ? "Unfavorite" : "Favorite"}</TooltipContent>
        </Tooltip>
      </Group>
    </>
  );
}
