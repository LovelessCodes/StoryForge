import { PackageOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { GridSkeleton } from "@/components/common/LoadingSkeleton";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useModpacks, type ModpackItem } from "@/hooks/use-modpacks";
import { toast } from "@/lib/notify";
import { useModpacksFilters } from "@/stores/modpacksFilters";
import { useSettingsStore } from "@/stores/settings";

import DeleteModpackSheet from "./DeleteModpackSheet";
import ModpackCard from "./ModpackCard";
import ModpackDetailSheet from "./ModpackDetailSheet";
import ModpackFormSheet from "./ModpackFormSheet";
import ModpacksFilterBar from "./ModpacksFilterBar";
import ModpacksPageHeader from "./ModpacksPageHeader";

/** The open detail sheet, derived from live query data. */
function findModpackById(modpacks: ModpackItem[], id: string | null): ModpackItem | null {
  return id ? (modpacks.find((modpack) => modpack.id === id) ?? null) : null;
}

export default function ModpacksPage() {
  const { t } = useTranslation();
  const { searchText, setSearchText, owner, setOwner } = useModpacksFilters();

  const { user } = useAuthSession();
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
  const detailModpack = findModpackById(modpacks, detailId);

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
      <ModpacksPageHeader onCreate={openCreate} />

      {/* Filters */}
      <ModpacksFilterBar />

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
