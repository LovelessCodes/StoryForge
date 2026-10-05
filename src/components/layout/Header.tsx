import { useLocation } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PAGE_PATHS } from "@/lib/routes";

import { Button } from "../ui/button";

const pageMeta: Record<string, { titleKey: string; descriptionKey?: string }> = {
  [PAGE_PATHS.profiles]: {
    titleKey: "layout.pages.profiles.title",
    descriptionKey: "layout.pages.profiles.description",
  },
  [PAGE_PATHS.mods]: { titleKey: "layout.pages.mods.title" },
  [PAGE_PATHS.modpacks]: {
    titleKey: "layout.pages.modpacks.title",
    descriptionKey: "layout.pages.modpacks.description",
  },
  [PAGE_PATHS.versions]: {
    titleKey: "layout.pages.versions.title",
    descriptionKey: "layout.pages.versions.description",
  },
  [PAGE_PATHS.worlds]: {
    titleKey: "layout.pages.worlds.title",
    descriptionKey: "layout.pages.worlds.description",
  },
  [PAGE_PATHS.servers]: {
    titleKey: "layout.pages.servers.title",
    descriptionKey: "layout.pages.servers.description",
  },
  [PAGE_PATHS.config]: {
    titleKey: "layout.pages.config.title",
    descriptionKey: "layout.pages.config.description",
  },
  [PAGE_PATHS.news]: {
    titleKey: "layout.pages.news.title",
    descriptionKey: "layout.pages.news.description",
  },
  [PAGE_PATHS.settings]: {
    titleKey: "layout.pages.settings.title",
    descriptionKey: "layout.pages.settings.description",
  },
  "/auth": {
    titleKey: "layout.pages.auth.title",
    descriptionKey: "layout.pages.auth.description",
  },
};

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const meta =
    pageMeta[pathname] ??
    (pathname.startsWith("/server-hosting")
      ? {
          titleKey: "layout.pages.serverHosting.title",
          descriptionKey: "layout.pages.serverHosting.description",
        }
      : { titleKey: "layout.pages.default.title" });

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4" data-tauri-drag-region>
      <h2 className="text-foreground text-base font-semibold whitespace-nowrap">
        {t(meta.titleKey)}
      </h2>

      {meta.descriptionKey && (
        <p className="text-muted-foreground truncate text-xs">{t(meta.descriptionKey)}</p>
      )}

      <div className="flex-1" />

      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          title={t("common.actions.refresh")}
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
          {isRefreshing ? t("layout.header.refreshing") : t("common.actions.refresh")}
        </Button>
      )}
    </header>
  );
}
