import { Link } from "@tanstack/react-router";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CloudOff,
  PackageOpen,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";

import { GridSkeleton } from "@/components/common/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useModpacks, type ModpackItem } from "@/hooks/use-modpacks";
import { useModpacksFilters, type ModpacksFilters } from "@/stores/modpacksFilters";

import DeleteModpackSheet from "./DeleteModpackSheet";
import ModpackCard from "./ModpackCard";
import ModpackDetailSheet from "./ModpackDetailSheet";
import ModpackFormSheet from "./ModpackFormSheet";

const SORT_OPTIONS: { label: string; value: ModpacksFilters["sortBy"] }[] = [
  { label: "Created", value: "created" },
  { label: "Downloads", value: "downloads" },
  { label: "Name", value: "name" },
  { label: "Last Updated", value: "updated" },
];

export default function ModpacksPage() {
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

  const { user, isLoading: sessionLoading } = useAuthSession();
  const { data, isPending } = useModpacks();

  const [formOpen, setFormOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const [editingModpack, setEditingModpack] = useState<ModpackItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deletingModpack, setDeletingModpack] = useState<ModpackItem | null>(null);

  const modpacks = data?.modpacks ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasFilters = searchText.length > 0 || owner.length > 0;
  // Derive the open detail from the live query data so version edits show up immediately.
  const detailModpack = detailId
    ? (modpacks.find((modpack) => modpack.id === detailId) ?? null)
    : null;

  const openCreate = () => {
    setEditingModpack(null);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  };

  const openEdit = (modpack: ModpackItem) => {
    setEditingModpack(modpack);
    setFormSession((session) => session + 1);
    setFormOpen(true);
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-end gap-2">
        {user && (
          <Button size="sm" variant="accent-primary" onClick={openCreate}>
            <Plus /> New modpack
          </Button>
        )}
      </div>

      {sessionLoading ? (
        <GridSkeleton count={8} />
      ) : !user ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <CloudOff className="text-muted-foreground size-6" />
          <div className="grid gap-1">
            <p className="text-sm font-medium">Modpacks require a Story Forge account</p>
            <p className="text-muted-foreground max-w-md text-xs">
              Sign in to browse community modpacks, install them in one click and publish your own.
              No account? Profiles can be exported and imported as files from the Profiles page, so
              you can still share setups offline.
            </p>
          </div>
          <Button size="sm" variant="accent-primary" render={<Link to="/auth" />}>
            Sign in
          </Button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:w-64">
              <InputGroupInput
                aria-label="Search modpacks"
                placeholder="Search modpacks…"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <Search className="size-4" />
              </InputGroupAddon>
            </InputGroup>

            <Select
              items={SORT_OPTIONS}
              value={sortBy}
              onValueChange={(value) => {
                if (value) setSortBy(value);
              }}
            >
              <SelectTrigger aria-label="Sort by" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              aria-label="Toggle sort direction"
              size="icon-sm"
              title={
                orderDirection === "desc"
                  ? "Sort direction: descending"
                  : "Sort direction: ascending"
              }
              variant="outline"
              onClick={() => setOrderDirection(orderDirection === "desc" ? "asc" : "desc")}
            >
              {orderDirection === "desc" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
            </Button>

            <InputGroup className="w-full sm:w-52">
              <InputGroupInput
                aria-label="Filter by owner"
                placeholder="Filter by owner…"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <Search className="size-4" />
              </InputGroupAddon>
            </InputGroup>
          </div>

          {/* Results */}
          {isPending ? (
            <GridSkeleton count={8} />
          ) : modpacks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
              <PackageOpen className="text-muted-foreground size-6" />
              <p className="text-muted-foreground text-xs">
                {hasFilters ? "No modpacks match your filters." : "No modpacks yet."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-muted-foreground text-xs">
                {totalCount} modpack{totalCount !== 1 ? "s" : ""} found
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {modpacks.map((modpack) => (
                  <ModpackCard
                    isOwner={user.id === modpack.owner.id}
                    key={modpack.id}
                    modpack={modpack}
                    onDelete={() => setDeletingModpack(modpack)}
                    onEdit={() => openEdit(modpack)}
                    onOpen={() => setDetailId(modpack.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ModpackFormSheet
        key={formSession}
        open={formOpen}
        modpack={editingModpack}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditingModpack(null);
        }}
      />

      {deletingModpack && (
        <DeleteModpackSheet
          open
          modpack={deletingModpack}
          onDeleted={(slug) => {
            if (detailModpack?.slug === slug) setDetailId(null);
          }}
          onOpenChange={(next) => {
            if (!next) setDeletingModpack(null);
          }}
        />
      )}

      {detailModpack && (
        <ModpackDetailSheet
          open
          modpack={detailModpack}
          onOpenChange={(next) => {
            if (!next) setDetailId(null);
          }}
        />
      )}
    </div>
  );
}
