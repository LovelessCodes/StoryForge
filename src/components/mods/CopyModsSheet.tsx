import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Loader2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import { modUpdatesQueryKey } from "@/hooks/use-mod-updates";
import { errorMessage } from "@/lib/errors";
import { baseGameVersion, pathBasename } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { OutputMod } from "@/lib/types";
import { useProfiles, type Profile } from "@/stores/profiles";

type ModCopyResult = {
  copied: number;
  replaced: number;
  unchanged: number;
  failed: { file: string; message: string }[];
};

/**
 * Copies the given installed mods into another profile.
 *
 * The backend leaves a mod alone when the destination already has the same
 * version, replaces a different version, and carries the source's
 * enabled/disabled state for the mods it touched.
 */
export function CopyModsSheet({
  gameVersion,
  mods,
  modsDirectory,
  onCopied,
  onOpenChange,
  open,
}: {
  /** Game version of the source profile, for the cross-version warning. */
  gameVersion?: string;
  mods: OutputMod[];
  /** Source profile root. */
  modsDirectory: string;
  /** Called after a run without failures, e.g. to clear the selection. */
  onCopied?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profiles } = useProfiles();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Copying into the profile the mods came from is meaningless; the backend
  // refuses it too. With a single candidate, preselect it.
  const destinations = useMemo(
    () => profiles.filter((profile) => profile.path !== modsDirectory),
    [profiles, modsDirectory],
  );
  const selectedDestination =
    destinations.find((profile) => String(profile.id) === selectedProfileId) ??
    (destinations.length === 1 ? destinations[0] : null);

  const sourceVersion = baseGameVersion(gameVersion ?? "");
  const destinationVersion = selectedDestination
    ? baseGameVersion(selectedDestination.version)
    : "";
  const versionMismatch =
    sourceVersion.length > 0 &&
    destinationVersion.length > 0 &&
    sourceVersion !== destinationVersion;

  const { mutate, isPending } = useMutation({
    mutationFn: (destination: Profile) =>
      invoke<ModCopyResult>("copy_mods_to_profile", {
        params: {
          source: modsDirectory,
          destination: destination.path,
          files: mods.map((mod) => pathBasename(mod.path)),
        },
      }),
    onError: (error) => {
      toast.error(t("mods.copy.failed"), { description: errorMessage(error) });
    },
    onSuccess: (result, destination) => {
      void queryClient.invalidateQueries({
        queryKey: installedModsQueryKey(destination.path),
      });
      void queryClient.invalidateQueries({
        queryKey: modUpdatesQueryKey(destination.path),
      });

      const changed = result.copied + result.replaced;
      if (result.failed.length > 0) {
        if (changed > 0) {
          toast.warning(
            t("mods.copy.partial", {
              copied: changed,
              count: mods.length,
              profile: destination.name,
            }),
            { description: result.failed[0]?.message },
          );
        } else {
          toast.error(t("mods.copy.failed"), {
            description: result.failed[0]?.message,
          });
        }
      } else if (changed === 0) {
        toast.info(t("mods.copy.nothing", { profile: destination.name }));
      } else {
        toast.success(t("mods.copy.done", { count: changed, profile: destination.name }), {
          description:
            result.replaced > 0 ? t("mods.copy.replaced", { count: result.replaced }) : undefined,
        });
      }

      // On a partial run the selection stays so the failed files can be
      // retried; already-copied mods are skipped as unchanged.
      if (result.failed.length === 0) onCopied?.();
      onOpenChange(false);
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Copy className="size-4" />
            {t("mods.copy.title")}
          </SheetTitle>
          <SheetDescription>{t("mods.copy.description", { count: mods.length })}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="copy-destination">
                {t("mods.copy.destination")}
              </label>
              <Select
                onValueChange={setSelectedProfileId}
                value={selectedDestination ? String(selectedDestination.id) : null}
              >
                <SelectTrigger
                  className="w-full"
                  id="copy-destination"
                  aria-label={t("mods.copy.destinationAria")}
                >
                  <span className="truncate">
                    {selectedDestination?.name ?? t("mods.copy.destinationPlaceholder")}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {destinations.map((profile) => (
                    <SelectItem key={profile.id} value={String(profile.id)}>
                      {profile.name}
                    </SelectItem>
                  ))}
                  {destinations.length === 0 && (
                    <div className="text-muted-foreground px-2 py-3 text-xs">
                      {t("mods.copy.noProfiles")}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {versionMismatch && (
              <div className="border-warning/40 flex items-start gap-2 border bg-[var(--color-warning)]/5 p-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
                <p className="text-xs">
                  {t("mods.copy.versionMismatch", {
                    sourceVersion,
                    version: destinationVersion,
                  })}
                </p>
              </div>
            )}

            <p className="text-muted-foreground text-[11px]">{t("mods.copy.replaceHint")}</p>

            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("mods.copy.mods")}
              </p>
              <div className="divide-y border">
                {mods.map((mod) => (
                  <div className="flex items-center gap-3 p-3" key={mod.path}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{mod.name}</p>
                      <p className="text-muted-foreground truncate font-mono text-[11px]">
                        {mod.modid} · {mod.version}
                      </p>
                    </div>
                    {mod.disabled && (
                      <Badge
                        className="text-muted-foreground shrink-0 text-[10px]"
                        variant="outline"
                      >
                        {t("mods.item.disabledBadge")}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            disabled={!selectedDestination || isPending || mods.length === 0}
            onClick={() => {
              if (selectedDestination) mutate(selectedDestination);
            }}
            variant="accent-primary"
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Copy />}
            {isPending ? t("mods.copy.copying") : t("mods.copy.copyAction")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
