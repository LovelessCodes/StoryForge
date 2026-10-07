import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ModInfo } from "@/lib/types";

type ParsedMod = { modid: string; version: string };

function parseMods(modsString: string): ParsedMod[] {
  return modsString
    .split(",")
    .map((entry) => {
      const [modid, version] = entry.trim().split("@");
      return { modid: modid?.trim() ?? "", version: version?.trim() ?? "" };
    })
    .filter((mod) => mod.modid && mod.version);
}

function useModInfo(modid: string) {
  return useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid }) as Promise<ModInfo>,
    queryKey: ["modInfo", modid],
    staleTime: Infinity,
  });
}

/** One mod inside a modpack version, enriched with Vintage Story ModDB metadata. */
function ModpackModRow({ modid, version }: ParsedMod) {
  const { data: modInfo, isLoading, isError } = useModInfo(modid);

  if (isLoading) {
    return <div className="bg-muted h-8 animate-pulse" />;
  }

  if (isError || !modInfo?.mod) {
    return (
      <span className="text-muted-foreground min-w-0 truncate font-mono text-[11px]">
        {modid}@{version}
      </span>
    );
  }

  const mod = modInfo.mod;
  const logoSrc = mod.logofile
    ? mod.logofile.startsWith("http")
      ? mod.logofile
      : `https://mods.vintagestory.at${mod.logofile}`
    : "https://mods.vintagestory.at/web/img/mod-default.png";
  const url = `https://mods.vintagestory.at/${mod.urlalias ?? `show/mod/${mod.assetid}`}`;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <a href={url} rel="noreferrer" target="_blank">
        <img alt={mod.name} className="size-7 shrink-0 object-cover" loading="lazy" src={logoSrc} />
      </a>
      <a
        className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        {mod.name}
      </a>
      <div className="text-muted-foreground/60 flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums">
        <span>{mod.downloads.toLocaleString()} ↓</span>
        <span>{mod.follows.toLocaleString()} ★</span>
        <span className="font-mono">v{version}</span>
      </div>
    </div>
  );
}

interface ModpackModsListProps {
  modsString: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Collapsible list of the mods a modpack version contains. */
export default function ModpackModsList({ modsString, open, onOpenChange }: ModpackModsListProps) {
  const { t } = useTranslation();
  if (!modsString) return null;
  const mods = parseMods(modsString);
  if (mods.length === 0) return null;

  return (
    <div className="grid gap-2">
      <button
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-[11px] transition-colors"
        type="button"
        onClick={() => onOpenChange(!open)}
      >
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {t("modpacks.modsList.count", { count: mods.length })}
      </button>
      {open && (
        <div className="bg-background/60 grid min-w-0 gap-1.5 border p-2">
          {mods.map((mod) => (
            <ModpackModRow key={mod.modid} modid={mod.modid} version={mod.version} />
          ))}
        </div>
      )}
    </div>
  );
}
