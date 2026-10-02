import { Download, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModpackItem } from "@/hooks/use-modpacks";

import ModpackImage from "./ModpackImage";

interface ModpackCardProps {
  modpack: ModpackItem;
  isOwner: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ModpackCard({
  modpack,
  isOwner,
  onOpen,
  onEdit,
  onDelete,
}: ModpackCardProps) {
  // Newest version by creation time — the API does not guarantee ordering.
  const latestVersion = modpack.modpackVersions.reduce<
    ModpackItem["modpackVersions"][number] | null
  >(
    (latest, version) =>
      latest === null || version.createdAt > latest.createdAt ? version : latest,
    null,
  );

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 cursor-pointer gap-0 p-0 transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      <div className="bg-muted relative aspect-video w-full overflow-hidden">
        <ModpackImage alt={modpack.name} className="size-full" src={modpack.imageUrl} />

        {isOwner && (
          <Badge className="bg-accent-primary/90 absolute top-2 left-2 border-transparent text-white">
            Yours
          </Badge>
        )}

        {isOwner && (
          <div className="absolute top-2 right-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={`Manage ${modpack.name}`}
                    size="icon-sm"
                    variant="secondary"
                    onClick={(event) => event.stopPropagation()}
                  />
                }
              >
                <MoreVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <CardHeader className="pt-3">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate transition-colors group-hover:text-[var(--color-accent-amber)]">
            {modpack.name}
          </span>
          {latestVersion ? (
            <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
              v{latestVersion.version}
            </span>
          ) : (
            <Badge className="shrink-0" variant="outline">
              Draft
            </Badge>
          )}
        </CardTitle>
        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          {modpack.owner.image ? (
            <img
              alt={modpack.owner.name}
              className="size-4 shrink-0 object-cover"
              loading="lazy"
              src={modpack.owner.image}
            />
          ) : null}
          <span className="truncate">by {modpack.owner.name}</span>
        </div>
      </CardHeader>

      <CardContent className="grid gap-2 pb-3">
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {modpack.description || "No description"}
        </p>
        <span className="text-muted-foreground/70 flex items-center gap-1 text-[11px]">
          <Download className="size-3" />
          {modpack.downloads.toLocaleString()} download
          {modpack.downloads !== 1 ? "s" : ""}
        </span>
      </CardContent>
    </Card>
  );
}
