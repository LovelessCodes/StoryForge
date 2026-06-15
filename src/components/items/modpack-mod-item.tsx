import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import type { ModInfo } from "@/lib/types";

type ModpackModItemProps = {
  modid: string;
  version: string;
};

function useModInfo(modid: string) {
  return useQuery({
    queryFn: () => invoke("fetch_mod_info", { modid }) as Promise<ModInfo>,
    queryKey: ["modInfo", modid],
    staleTime: Infinity,
  });
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

export function ModpackModItem({ modid, version }: ModpackModItemProps) {
  const { data: modInfo, isLoading, isError } = useModInfo(modid);

  if (isLoading) {
    return <div className="bg-muted h-8 animate-pulse rounded" />;
  }

  if (isError || !modInfo?.mod) {
    return (
      <span className="text-muted-foreground font-mono text-xs">
        {modid} @ {version}
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
    <div className="flex items-center gap-2">
      <a href={url} rel="noreferrer" target="_blank">
        <img alt={mod.name} className="size-7 rounded" loading="lazy" src={logoSrc} />
      </a>
      <div className="flex min-w-0 flex-1 items-baseline gap-1">
        <a
          className="truncate text-xs font-medium hover:underline"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          {mod.name}
        </a>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-muted-foreground/60 text-[10px] tabular-nums">
          {formatNum(mod.downloads)} ↓
        </span>
        <span className="text-muted-foreground/60 text-[10px] tabular-nums">
          {formatNum(mod.follows)} ★
        </span>
        <span className="text-muted-foreground/60 font-mono text-[10px]">v{version}</span>
      </div>
    </div>
  );
}
