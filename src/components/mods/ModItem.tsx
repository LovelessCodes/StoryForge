import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  Check,
  Download,
  DownloadCloudIcon,
  ExternalLink,
  EyeOff,
  Heart,
  MessageSquare,
  PackageMinusIcon,
  PackagePlusIcon,
  PackageSearchIcon,
  Pin,
  PinOff,
  Power,
  PowerOff,
  SkipForward,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAddLatestModVersion } from "@/hooks/use-add-latest-mod-version";
import { useAddModUpdateToProfile } from "@/hooks/use-add-mod-update-to-profile";
import { installedModsQueryKey } from "@/hooks/use-installed-mods";
import {
  type ModUpdate,
  type ModUpdatesResponse,
  modUpdatesQueryKey,
} from "@/hooks/use-mod-updates";
import { useSetModEnabled } from "@/hooks/use-set-mod-enabled";
import { compareSemverAsc, hashPath, pathDelimiter } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModTag, OutputMod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

const DEFAULT_LOGO = "https://mods.vintagestory.at/web/img/mod-default.png";

/** Tag chips shown per mod row before the rest collapse into a `+N` badge. */
const MAX_VISIBLE_TAGS = 4;

export function ModItem({
  canToggleMods,
  destinationLabel,
  installedMods,
  mod,
  modsDirectory,
  modUpdates,
  onAdd,
  onAuthorClick,
  onRemove,
  onStandaloneInstall,
  onTagClick,
  onUpdate,
  selectedTagNames,
  tagByName,
  tagColorMap,
}: {
  /** Whether the target supports the enabled/disabled mod flag (profiles do). */
  canToggleMods: boolean;
  mod: Mod;
  installedMods: OutputMod[];
  modUpdates: ModUpdatesResponse | undefined;
  modsDirectory?: string;
  destinationLabel: string;
  tagColorMap: Record<string, string>;
  tagByName: Record<string, ModTag>;
  selectedTagNames: Set<string>;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  onAuthorClick: (author: string) => void;
  onAdd: (mod: Mod) => void;
  onUpdate: (mod: Mod, installedMod: OutputMod) => void;
  onRemove: (mod: Mod, installedMod: OutputMod) => void;
  onStandaloneInstall: (mod: Mod) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const modIdStrings = new Set(mod.modidstrs);
  const installedMod = installedMods.find(
    (i) => i.modid === String(mod.modid) || modIdStrings.has(i.modid),
  );
  const updateMod =
    modUpdates?.updates[mod.modidstrs[0]] ??
    modUpdates?.updates[mod.modid.toString()] ??
    modUpdates?.updates[mod.assetid.toString()] ??
    modUpdates?.updates[mod.urlalias ?? ""];

  const pathHash = modsDirectory ? hashPath(modsDirectory) : "standalone";

  const { mutate: downloadLatest, isPending: isDownloading } = useAddLatestModVersion({
    destinationLabel,
    mod,
    modsDirectory,
  });

  const { mutate: addUpdate, isPending: updatePending } = useAddModUpdateToProfile({
    onError: (error) => {
      toast.error(
        t("mods.errors.update", {
          name: mod.name,
          destination: destinationLabel,
          message: error.message,
        }),
        {
          id: `add-mod-${mod.modid}-${pathHash}`,
        },
      );
    },
  });

  const { mutate: removeThenUpdate, isPending: removeUpdatePending } = useMutation({
    mutationFn: (variables: { path: string; modpath: string; update: ModUpdate }) =>
      invoke("remove_mod_from_profile", {
        params: { modpath: variables.modpath, path: variables.path },
      }),
    onError: (error, variables) => {
      toast.error(
        t("mods.errors.remove", {
          name: variables.modpath,
          destination: destinationLabel,
          message: error.message,
        }),
        {
          id: `mod-remove-${variables.path}-${variables.modpath}`,
        },
      );
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: installedModsQueryKey(variables.path) }),
        queryClient.invalidateQueries({ queryKey: modUpdatesQueryKey(variables.path) }),
      ]);
      addUpdate({
        destinationLabel,
        label: `${mod.name} v${variables.update.modversion}`,
        modsDirectory: variables.path,
        mod: variables.update,
      });
    },
  });

  const canUpdate = Boolean(
    updateMod &&
    modsDirectory &&
    installedMod &&
    compareSemverAsc(updateMod.modversion, installedMod.version) > 0,
  );
  const showInstalled = Boolean(installedMod && modsDirectory);
  const isDisabled = installedMod?.disabled ?? false;
  const { mutate: setModEnabled, isPending: statePending } = useSetModEnabled(modsDirectory);
  const pinned = useSettingsStore((s) =>
    modsDirectory && installedMod
      ? (s.pinnedMods[modsDirectory]?.includes(installedMod.modid.toLowerCase()) ?? false)
      : false,
  );
  const toggleModPin = useSettingsStore((s) => s.toggleModPin);
  const skippedModUpdates = useSettingsStore((s) => s.skippedModUpdates);
  const skipModUpdate = useSettingsStore((s) => s.skipModUpdate);
  const clearModUpdateSkip = useSettingsStore((s) => s.clearModUpdateSkip);
  const favoriteMods = useSettingsStore((s) => s.favoriteMods);
  const toggleFavoriteMod = useSettingsStore((s) => s.toggleFavoriteMod);
  // Favourites are keyed by the primary modidstr so they survive profile
  // changes and match the same listing across search results and installs.
  const favoriteKey = (mod.modidstrs[0] ?? mod.urlalias ?? String(mod.modid)).toLowerCase();
  const isFavorite = favoriteMods.includes(favoriteKey);
  // The same key identifies the skip entry: only recorded for installed mods.
  const skippedVersion = installedMod ? skippedModUpdates[favoriteKey] : undefined;

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3 border bg-card p-3 transition-colors hover:bg-muted/40",
        // Installed: green. Pinned: amber. Update waiting (and not pinned):
        // purple, so a pending update stands out from a plain install.
        showInstalled &&
          !pinned &&
          !canUpdate &&
          "border-success/40 bg-linear-to-r from-success/15 to-transparent",
        showInstalled &&
          pinned &&
          "border-accent-amber/40 bg-linear-to-r from-accent-amber/15 to-transparent",
        canUpdate &&
          "border-accent-primary/40 bg-linear-to-r from-accent-primary/15 to-transparent",
        isDisabled && "opacity-60",
      )}
    >
      <ModSummary
        installedMod={installedMod}
        mod={mod}
        onAuthorClick={onAuthorClick}
        onTagClick={onTagClick}
        selectedTagNames={selectedTagNames}
        tagByName={tagByName}
        tagColorMap={tagColorMap}
      />

      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t(isFavorite ? "mods.item.unfavorite" : "mods.item.favorite")}
                onClick={() => toggleFavoriteMod(favoriteKey)}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <Star
              className={
                isFavorite
                  ? "fill-[var(--color-accent-amber)] text-[var(--color-accent-amber)]"
                  : undefined
              }
            />
          </TooltipTrigger>
          <TooltipContent>
            {t(isFavorite ? "mods.item.unfavorite" : "mods.item.favorite")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t("mods.item.openOnModDB")}
                onClick={() =>
                  void openUrl(`https://mods.vintagestory.at/${mod.urlalias ?? mod.modid}`)
                }
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <ExternalLink />
          </TooltipTrigger>
          <TooltipContent>{t("mods.item.openOnModDB")}</TooltipContent>
        </Tooltip>
        {canUpdate && installedMod && updateMod ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t("mods.item.updateToLatest")}
                    disabled={removeUpdatePending || updatePending}
                    onClick={() =>
                      removeThenUpdate({
                        path: modsDirectory ?? "",
                        modpath: installedMod.path,
                        update: updateMod,
                      })
                    }
                    size="icon-sm"
                    variant="outline-accent-primary"
                  />
                }
              >
                <DownloadCloudIcon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                <span className="grid gap-0.5">
                  <span className="font-mono">
                    {installedMod.version} → {updateMod.modversion}
                  </span>
                  <span>{t("mods.item.updateToLatest")}</span>
                </span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t("mods.updates.skipTooltip", { version: updateMod.modversion })}
                    onClick={() => {
                      skipModUpdate(favoriteKey, updateMod.modversion);
                      toast.info(
                        t("mods.updates.skippedToast", {
                          name: mod.name,
                          version: updateMod.modversion,
                        }),
                      );
                    }}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <SkipForward aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                {t("mods.updates.skipTooltip", { version: updateMod.modversion })}
              </TooltipContent>
            </Tooltip>
          </>
        ) : installedMod ? (
          skippedVersion ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t("mods.updates.skippedTooltip", { version: skippedVersion })}
                    onClick={() => {
                      clearModUpdateSkip(favoriteKey);
                      toast.info(t("mods.updates.restoredToast", { name: mod.name }));
                    }}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <EyeOff aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                {t("mods.updates.skippedTooltip", { version: skippedVersion })}
              </TooltipContent>
            </Tooltip>
          ) : null
        ) : modsDirectory ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t("mods.item.downloadLatest")}
                  disabled={isDownloading}
                  onClick={() => downloadLatest({ path: `${modsDirectory}${pathDelimiter}Mods` })}
                  size="icon-sm"
                  variant="outline"
                />
              }
            >
              <DownloadCloudIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("mods.item.installLatest")}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t("mods.item.installTo")}
                  onClick={() => onStandaloneInstall(mod)}
                  size="icon-sm"
                  variant="outline-accent-primary"
                />
              }
            >
              <DownloadCloudIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("mods.item.installToDestination")}</TooltipContent>
          </Tooltip>
        )}

        {modsDirectory && installedMod ? (
          <>
            {canToggleMods && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={isDisabled ? t("mods.item.enable") : t("mods.item.disable")}
                      disabled={statePending}
                      onClick={() =>
                        setModEnabled({
                          modid: installedMod.modid,
                          version: installedMod.version,
                          enabled: isDisabled,
                          name: mod.name,
                        })
                      }
                      size="icon-sm"
                      variant={isDisabled ? "outline" : "ghost"}
                    />
                  }
                >
                  {isDisabled ? <Power aria-hidden="true" /> : <PowerOff aria-hidden="true" />}
                </TooltipTrigger>
                <TooltipContent>
                  {isDisabled
                    ? t("mods.item.enableTooltip", { name: mod.name })
                    : t("mods.item.disableTooltip", { name: mod.name })}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={pinned ? t("mods.item.unpin") : t("mods.item.pin")}
                    onClick={() => toggleModPin(modsDirectory, installedMod.modid)}
                    size="icon-sm"
                    variant={pinned ? "outline-amber" : "outline"}
                  />
                }
              >
                {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              </TooltipTrigger>
              <TooltipContent>
                {pinned
                  ? t("mods.item.pinnedTooltip", { version: installedMod.version })
                  : t("mods.item.pinTooltip", { version: installedMod.version })}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t("mods.item.browseVersions")}
                    onClick={() => onUpdate(mod, installedMod)}
                    size="icon-sm"
                    variant="outline"
                  />
                }
              >
                <PackageSearchIcon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{t("mods.item.browseVersionsTooltip")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t("common.actions.remove")}
                    onClick={() => onRemove(mod, installedMod)}
                    size="icon-sm"
                    variant="destructive"
                  />
                }
              >
                <PackageMinusIcon aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                {t("mods.item.removeFrom", { destination: destinationLabel })}
              </TooltipContent>
            </Tooltip>
          </>
        ) : modsDirectory ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t("mods.item.add")}
                  onClick={() => onAdd(mod)}
                  size="icon-sm"
                  variant="outline"
                />
              }
            >
              <PackagePlusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              {t("mods.item.addTo", { destination: destinationLabel })}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t("mods.item.install")}
                  onClick={() => onStandaloneInstall(mod)}
                  size="icon-sm"
                  variant="outline"
                />
              }
            >
              <PackagePlusIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("mods.item.installToDestination")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Logo, name, author, summary, counts and tags. */
function ModSummary({
  installedMod,
  mod,
  onAuthorClick,
  onTagClick,
  selectedTagNames,
  tagByName,
  tagColorMap,
}: {
  mod: Mod;
  installedMod: OutputMod | undefined;
  onAuthorClick: (author: string) => void;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  selectedTagNames: Set<string>;
  tagByName: Record<string, ModTag>;
  tagColorMap: Record<string, string>;
}) {
  const { t } = useTranslation();
  const modUrl = `https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`;

  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <a href={modUrl} rel="noreferrer" target="_blank">
          <img
            alt={mod.name}
            className="bg-muted size-12 border object-cover transition-transform hover:scale-105"
            loading="lazy"
            src={mod.logo ?? DEFAULT_LOGO}
          />
        </a>
        {installedMod && (
          <Badge
            aria-label={t("mods.item.installedVersion", { version: installedMod.version })}
            variant="outline"
            className="border-success/40 text-success gap-1 px-1.5 text-[10px]"
            title={t("mods.item.installedVersion", { version: installedMod.version })}
          >
            <Check className="size-3" aria-hidden="true" />v{installedMod.version}
          </Badge>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <a className="min-w-0" href={modUrl} rel="noreferrer" target="_blank">
            <h3 className="hover:text-accent-amber truncate text-sm font-semibold transition-colors">
              {mod.name}
            </h3>
          </a>
          {installedMod?.disabled && (
            <Badge variant="outline" className="text-muted-foreground shrink-0 text-[10px]">
              {t("mods.item.disabledBadge")}
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label={t("mods.item.filterBy", { author: mod.author })}
                  className="text-muted-foreground hover:text-accent-amber max-w-[45%] shrink-0 cursor-pointer truncate text-xs"
                  onClick={() => onAuthorClick(mod.author)}
                  type="button"
                />
              }
            >
              {t("mods.item.byAuthor", { author: mod.author })}
            </TooltipTrigger>
            <TooltipContent>{t("mods.item.filterByAuthor", { author: mod.author })}</TooltipContent>
          </Tooltip>
        </div>
        <p className="text-muted-foreground line-clamp-1 text-xs">{mod.summary}</p>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <Download className="size-3" />
            {mod.downloads.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="size-3" />
            {mod.follows.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="size-3" />
            {mod.comments.toLocaleString()}
          </span>
        </div>
        {mod.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {mod.tags.slice(0, MAX_VISIBLE_TAGS).map((tagName) => (
              <ModTagChip
                isActive={selectedTagNames.has(tagName)}
                key={tagName}
                onTagClick={onTagClick}
                tag={tagByName[tagName]}
                tagColor={tagColorMap[tagName]}
                tagName={tagName}
              />
            ))}
            {mod.tags.length > MAX_VISIBLE_TAGS && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="text-muted-foreground inline-flex cursor-default items-center border border-dashed px-1.5 py-px text-[10px] leading-relaxed font-medium" />
                  }
                >
                  +{mod.tags.length - MAX_VISIBLE_TAGS}
                </TooltipTrigger>
                <TooltipContent>
                  <span className="grid gap-0.5">
                    {mod.tags.slice(MAX_VISIBLE_TAGS).map((tagName) => (
                      <span key={tagName}>{tagName}</span>
                    ))}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModTagChip({
  isActive,
  onTagClick,
  tag,
  tagColor,
  tagName,
}: {
  isActive: boolean;
  onTagClick: (tag: ModTag, isActive: boolean) => void;
  tag: ModTag | undefined;
  tagColor: string | undefined;
  tagName: string;
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center border px-1.5 py-px text-[10px] leading-relaxed font-medium transition-opacity hover:opacity-80",
        isActive && "ring-1 ring-primary",
      )}
      onClick={() => {
        if (!tag) return;
        onTagClick(tag, isActive);
      }}
      style={
        tagColor
          ? {
              backgroundColor: `${tagColor}20`,
              borderColor: `${tagColor}50`,
              color: tagColor,
            }
          : undefined
      }
      type="button"
    >
      {tagName}
    </button>
  );
}
