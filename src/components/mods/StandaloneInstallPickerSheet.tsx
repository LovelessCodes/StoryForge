import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHostedServers } from "@/hooks/queries/server-hosting";
import { hashPath, latestRelease, pathDelimiter } from "@/lib/helpers";
import { toast } from "@/lib/notify";
import type { Mod, ModInfo, Release } from "@/lib/types";
import { useProfiles } from "@/stores/profiles";

import { useDownloadManager } from "../../hooks/use-download-manager";
import { ModVersionPicker } from "./ModVersionPicker";

type Destination = {
  id: string;
  name: string;
  path: string;
  type: "profile" | "hosted-server";
};

/** Standalone install flow (no active profile): pick a destination + release. */
export function StandaloneInstallPickerSheet({
  mod,
  onOpenChange,
  open,
}: {
  mod: Mod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { profiles } = useProfiles();
  const { data: hostedInstances } = useHostedServers();
  const { data: modInfo } = useQuery({
    enabled: open,
    queryFn: () => invoke("fetch_mod_info", { modid: mod.modid.toString() }) as Promise<ModInfo>,
    queryKey: ["modInfo", mod.modid],
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const destinations = useMemo<Destination[]>(
    () => [
      ...profiles.map((profile) => ({
        id: `profile-${profile.id}`,
        name: profile.name,
        path: `${profile.path}${pathDelimiter}Mods`,
        type: "profile" as const,
      })),
      ...(hostedInstances ?? []).map((instance) => ({
        id: `hosted-${instance.id}`,
        name: instance.name,
        path: `${instance.data_dir}${pathDelimiter}Mods`,
        type: "hosted-server" as const,
      })),
    ],
    [profiles, hostedInstances],
  );

  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [userSelectedVersion, setUserSelectedVersion] = useState<Release | null>(null);
  const selectedVersion = userSelectedVersion ?? latestRelease(modInfo?.mod.releases) ?? null;
  const name = modInfo?.mod.name ?? mod.name;
  const { startModDownload } = useDownloadManager();

  const { mutate: installMod, isPending } = useMutation({
    mutationFn: async ({ dest, release }: { dest: Destination; release: Release }) => {
      if (!release.mainfile) {
        throw new Error(t("mods.standaloneInstall.noDownload", { name }));
      }
      // The destination ends in `/Mods`; the profile/server root is what the
      // mod lists are keyed by.
      const modsSuffix = `${pathDelimiter}Mods`;
      const modsDirectory = dest.path.endsWith(modsSuffix)
        ? dest.path.slice(0, -modsSuffix.length)
        : dest.path;
      // Runs in the downloads manager; progress, pausing and cancelling
      // happen in the Downloads sheet.
      startModDownload({
        token: `mod:${mod.modid}:${release.modversion}:${hashPath(dest.path)}`,
        label: `${name} v${release.modversion}`,
        detail: dest.name,
        url: release.mainfile,
        destpath: dest.path,
        modsDirectory,
      });
      onOpenChange(false);
    },
    onError: (error, variables) => {
      if (error.message === "Download cancelled") return;
      toast.error(
        t("mods.errors.install", {
          name,
          destination: variables.dest.name,
          message: error.message,
        }),
        { id: `standalone-install-${mod.modid}-${variables.dest.id}` },
      );
    },
  });

  const destinationProfiles = destinations.filter((d) => d.type === "profile");
  const destinationHosted = destinations.filter((d) => d.type === "hosted-server");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            <Trans
              components={{ name: <span className="text-accent-amber" /> }}
              i18nKey="mods.standaloneInstall.title"
              values={{ name }}
            />
          </SheetTitle>
          <SheetDescription>{t("mods.standaloneInstall.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("mods.standaloneInstall.destination")}
              </p>
              <Select
                onValueChange={(value) => {
                  const dest = destinations.find((d) => d.id === value);
                  setSelectedDestination(dest ?? null);
                }}
                value={selectedDestination?.id ?? null}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("mods.standaloneInstall.destinationAria")}
                >
                  <span className="truncate">
                    {selectedDestination?.name ??
                      t("mods.standaloneInstall.destinationPlaceholder")}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {destinationProfiles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("mods.standaloneInstall.profiles")}</SelectLabel>
                      {destinationProfiles.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {destinationHosted.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("mods.standaloneInstall.hostedServers")}</SelectLabel>
                      {destinationHosted.map((dest) => (
                        <SelectItem key={dest.id} value={dest.id}>
                          {dest.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {destinations.length === 0 && (
                    <div className="text-muted-foreground px-2 py-3 text-xs">
                      {t("mods.standaloneInstall.noDestinations")}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("common.fields.version")}
              </p>
              <ModVersionPicker
                onSelect={setUserSelectedVersion}
                releases={modInfo?.mod.releases}
                selected={selectedVersion}
              />
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={!selectedDestination || !selectedVersion || isPending}
            onClick={() => {
              if (selectedDestination && selectedVersion) {
                installMod({ dest: selectedDestination, release: selectedVersion });
              }
            }}
          >
            {t("common.actions.install")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
