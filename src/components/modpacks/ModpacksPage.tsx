import { Link } from "@tanstack/react-router";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CloudOff,
  PackageOpen,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

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
import { toast } from "@/lib/notify";
import { useModpacksFilters, type ModpacksFilters } from "@/stores/modpacksFilters";
import { useSettingsStore } from "@/stores/settings";

import DeleteModpackSheet from "./DeleteModpackSheet";
import ModpackCard from "./ModpackCard";
import ModpackDetailSheet from "./ModpackDetailSheet";
import ModpackFormSheet from "./ModpackFormSheet";

export default function ModpacksPage() {
  const { t } = useTranslation();
  const sortOptions: { label: string; value: ModpacksFilters["sortBy"] }[] = [
    { label: t("modpacks.sort.created"), value: "created" },
    { label: t("modpacks.sort.downloads"), value: "downloads" },
    { label: t("modpacks.sort.name"), value: "name" },
    { label: t("modpacks.sort.lastUpdated"), value: "updated" },
  ];
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [deletingModpack, setDeletingModpack] = useState<ModpackItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const modpacks = data?.modpacks ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasFilters = searchText.length > 0 || owner.length > 0;

  // A deep link (`storyforge://install?pack=…`) queued a modpack slug; open
  // its detail sheet once the list is loaded, clearing filters that hide it.
  const pendingDeepLinkPack = useSettingsStore((s) => s.pendingDeepLinkPack);
  const setPendingDeepLinkPack = useSettingsStore((s) => s.setPendingDeepLinkPack);
  useEffect(() => {
    const slug = pendingDeepLinkPack;
    if (!slug || isPending) return;
    // The state updates run in a callback rather than synchronously in the
    // effect; the list identity changes per render, so the slug and the filter
    // values are the real triggers.
    void (async () => {
      const modpack = modpacks.find((entry) => entry.slug === slug);
      if (!modpack) {
        // Active filters may be hiding the pack; clear them and let the next
        // pass find it before reporting it missing.
        if (searchText.length > 0 || owner.length > 0) {
          setSearchText("");
          setOwner("");
          return;
        }
        setPendingDeepLinkPack(null);
        toast.error(t("modpacks.deepLink.notFound", { slug }));
        return;
      }
      setPendingDeepLinkPack(null);
      setDetailId(modpack.id);
      setDetailOpen(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeepLinkPack, isPending, searchText, owner]);
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
      <div className="flex items-center justify-between gap-3">
        {!sessionLoading && !user ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <CloudOff className="size-4 shrink-0" />
            <p>
              <Trans
                i18nKey="modpacks.page.guest"
                components={{
                  signIn: (
                    <Link
                      className="hover:text-foreground underline underline-offset-2"
                      to="/auth"
                    />
                  ),
                }}
              />
            </p>
          </div>
        ) : (
          <span />
        )}
        {user && (
          <Button size="sm" variant="accent-primary" onClick={openCreate}>
            <Plus /> {t("modpacks.page.newModpack")}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupInput
            aria-label={t("modpacks.page.searchAria")}
            placeholder={t("modpacks.page.searchPlaceholder")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <Search className="size-4" />
          </InputGroupAddon>
        </InputGroup>

        <Select
          items={sortOptions}
          value={sortBy}
          onValueChange={(value) => {
            if (value) setSortBy(value);
          }}
        >
          <SelectTrigger aria-label={t("modpacks.page.sortByAria")} className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          aria-label={t("modpacks.page.toggleSortAria")}
          size="icon-sm"
          title={
            orderDirection === "desc" ? t("modpacks.page.sortDesc") : t("modpacks.page.sortAsc")
          }
          variant="outline"
          onClick={() => setOrderDirection(orderDirection === "desc" ? "asc" : "desc")}
        >
          {orderDirection === "desc" ? <ArrowDownNarrowWide /> : <ArrowUpNarrowWide />}
        </Button>

        <InputGroup className="w-full sm:w-52">
          <InputGroupInput
            aria-label={t("modpacks.page.filterOwnerAria")}
            placeholder={t("modpacks.page.filterOwnerPlaceholder")}
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
            {hasFilters ? t("modpacks.page.emptyFiltered") : t("modpacks.page.empty")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground text-xs">
            {t("modpacks.page.found", { count: totalCount })}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {modpacks.map((modpack) => (
              <ModpackCard
                isOwner={user?.id === modpack.owner.id}
                key={modpack.id}
                modpack={modpack}
                onDelete={() => {
                  setDeletingModpack(modpack);
                  setDeleteOpen(true);
                }}
                onEdit={() => openEdit(modpack)}
                onOpen={() => {
                  setDetailId(modpack.id);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <ModpackFormSheet
        key={formSession}
        open={formOpen}
        modpack={editingModpack}
        onOpenChange={setFormOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setEditingModpack(null);
        }}
      />

      {deletingModpack && (
        <DeleteModpackSheet
          open={deleteOpen}
          modpack={deletingModpack}
          onDeleted={(slug) => {
            if (detailModpack?.slug === slug) setDetailId(null);
          }}
          onOpenChange={setDeleteOpen}
          onOpenChangeComplete={(open) => {
            if (!open) setDeletingModpack(null);
          }}
        />
      )}

      {detailModpack && (
        <ModpackDetailSheet
          open={detailOpen}
          modpack={detailModpack}
          onOpenChange={setDetailOpen}
          onOpenChangeComplete={(open) => {
            if (!open) setDetailId(null);
          }}
        />
      )}
    </div>
  );
}
