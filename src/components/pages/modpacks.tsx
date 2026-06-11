import { Pencil, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { CreateModpackDialog } from "@/components/dialogs/create-modpack.dialog";
import { DeleteModpackDialog } from "@/components/dialogs/delete-modpack.dialog";
import { ModpackDetailDialog } from "@/components/dialogs/modpack-detail.dialog";
import { SearchInput } from "@/components/inputs/search.input";
import { TextSwitch } from "@/components/switches/text.switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogTrigger } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { rootAlertDialogHandle, rootDialogHandle } from "@/handles";
import { useAuthSession } from "@/hooks/use-auth-session";
import { type ModpackItem, useModpacks } from "@/hooks/use-modpacks";
import { useModpacksFilters } from "@/stores/modpacksFilters";

const SORT_OPTIONS: Record<string, string> = {
  createdAt: "Created",
  downloads: "Downloads",
  name: "Name",
  updatedAt: "Last Updated",
};

export function ModpacksPage() {
  const {
    searchText,
    setSearchText,
    sortBy,
    setSortBy,
    orderDirection,
    setOrderDirection,
    owner,
    setOwner,
  } = useModpacksFilters();

  const { user } = useAuthSession();

  const { data, isPending } = useModpacks();

  const modpacks = data?.modpacks ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className="flex size-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-2 pt-0.5 pb-2 max-md:pl-8">
        <SearchInput
          className="h-9 w-56"
          onChange={(e) => {
            setSearchText(e.target.value);
          }}
          placeholder="Search modpacks..."
          value={searchText}
        />

        {/* Sort by */}
        <div className="group relative">
          <Label className="bg-background text-muted-foreground pointer-events-none absolute inset-s-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium">
            Sort by
          </Label>
          <Select
            onValueChange={(value) => {
              setSortBy(value as typeof sortBy);
            }}
            value={sortBy}
          >
            <SelectTrigger className="h-9">{SORT_OPTIONS[sortBy] ?? "Sort by"}</SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {Object.entries(SORT_OPTIONS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Order direction toggle */}
        <TextSwitch
          checked={orderDirection === "desc"}
          onCheckedChange={(checked) => setOrderDirection(checked ? "desc" : "asc")}
          textChecked="Desc"
          textUnchecked="Asc"
        />

        {/* Owner filter */}
        <InputGroup className="h-9 w-44">
          <InputGroupInput
            className="h-9"
            onChange={(e) => {
              setOwner(e.target.value);
            }}
            placeholder="Filter by owner…"
            value={owner}
          />
          <InputGroupAddon align="inline-end">
            <SearchIcon aria-hidden className="size-4" />
          </InputGroupAddon>
        </InputGroup>

        {/* Create modpack — signed-in users only */}
        {user && (
          <Button
            className="ml-auto"
            render={
              <DialogTrigger handle={rootDialogHandle} payload={() => <CreateModpackDialog />} />
            }
            size="sm"
          >
            <PlusIcon className="mr-1 size-3.5" />
            New modpack
          </Button>
        )}
      </div>

      <Separator />

      {/* Results */}
      <ScrollArea scrollFade className="p-4">
        {isPending ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground animate-pulse text-sm">Loading modpacks…</p>
          </div>
        ) : modpacks.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground text-sm">
              {searchText || owner ? "No modpacks match your filters." : "No modpacks yet."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground mb-4 text-xs">
              {totalCount} modpack{totalCount !== 1 ? "s" : ""} found
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {modpacks.map((mp) => (
                <ModpackCard
                  key={mp.id}
                  modpack={mp}
                  onEdit={() =>
                    rootDialogHandle.openWithPayload(() => <CreateModpackDialog modpack={mp} />)
                  }
                  userId={user?.id ?? null}
                />
              ))}
            </div>
          </>
        )}
      </ScrollArea>
    </div>
  );
}

export function ModpackCard({
  modpack,
  onDelete,
  onEdit,
  userId,
}: {
  modpack: ModpackItem;
  onDelete?: () => void;
  onEdit: () => void;
  userId: string | null;
}) {
  const isOwner = userId === modpack.owner.id;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    rootAlertDialogHandle.openWithPayload(() => (
      <DeleteModpackDialog name={modpack.name} onDeleted={onDelete} slug={modpack.slug} />
    ));
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onEdit();
  };

  return (
    <DialogTrigger
      handle={rootDialogHandle}
      payload={() => <ModpackDetailDialog modpack={modpack} />}
      nativeButton={false}
      render={
        <Card className="group/card hover:border-primary/50 focus-visible:ring-ring relative h-full cursor-pointer border transition-colors focus-visible:ring-2 focus-visible:outline-none">
          <div className="bg-muted relative aspect-video w-full overflow-hidden">
            <img
              alt={modpack.name}
              className="size-full object-cover"
              loading="lazy"
              src={
                modpack.imageUrl?.length
                  ? modpack.imageUrl
                  : "https://mods.vintagestory.at/web/img/mod-default.png"
              }
            />
            {/* Owner badge — top-left */}
            {isOwner && (
              <div className="bg-primary/90 text-primary-foreground absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                Yours
              </div>
            )}
            {/* Owner controls — edit/delete overlays on hover */}
            {isOwner && (
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover/card:opacity-100">
                <button
                  className="bg-background/80 hover:bg-background rounded p-1"
                  onClick={handleEdit}
                  type="button"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  className="bg-background/80 hover:bg-destructive hover:text-destructive-foreground rounded p-1"
                  onClick={handleDelete}
                  type="button"
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
            )}
          </div>
          <CardHeader>
            <CardTitle>
              {modpack.name}{" "}
              {modpack.modpackVersions.length ? (
                <span className="text-muted-foreground text-xs">
                  v
                  {
                    modpack.modpackVersions.reduce((max, v) =>
                      v.createdAt > max.createdAt ? v : max,
                    )?.version
                  }
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Draft</span>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              by{" "}
              {modpack.owner.image ? (
                <img alt={modpack.owner.name} className="size-4" src={modpack.owner.image} />
              ) : null}
              <span>{modpack.owner.name}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground line-clamp-2 text-xs">
              {modpack.description || "No description"}
            </p>
            <p className="text-muted-foreground/60 text-xs">
              {modpack.downloads.toLocaleString()} download{modpack.downloads !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      }
    />
  );
}
