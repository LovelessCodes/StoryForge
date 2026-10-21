import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { hostPlatformQuery } from "@/lib/queries";
import { useSettingsStore } from "@/stores/settings";

export const STORYFORGE_DOWNLOAD_URL = "https://getstoryforge.app/";

/**
 * An Intel build of Story Forge can run under Rosetta on Apple Silicon, but
 * the updater keeps serving Intel updates. Point those users at the native
 * build once; dismissing it is remembered across restarts.
 */
export default function IntelBuildBanner() {
  const { t } = useTranslation();
  const { data: hostPlatform } = useQuery(hostPlatformQuery);
  const dismissed = useSettingsStore((s) => s.intelBuildDismissed);
  const dismiss = useSettingsStore((s) => s.dismissIntelBuild);

  if (dismissed || !hostPlatform?.translated) return null;

  return (
    <div
      className="border-accent-primary/30 bg-accent-primary/5 flex shrink-0 items-center gap-3 border-x-0 border-t-0 border-b px-4 py-2"
      role="status"
    >
      <Info className="text-accent-primary size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{t("layout.intelBuild.title")}</p>
        <p className="text-muted-foreground text-[11px]">
          <Trans
            i18nKey="layout.intelBuild.description"
            components={{
              link: (
                <a
                  className="hover:text-foreground underline underline-offset-2"
                  href={STORYFORGE_DOWNLOAD_URL}
                  rel="noreferrer"
                  target="_blank"
                  onClick={(event) => {
                    event.preventDefault();
                    void openUrl(STORYFORGE_DOWNLOAD_URL);
                  }}
                />
              ),
            }}
          />
        </p>
      </div>
      <Button
        aria-label={t("common.actions.dismiss")}
        size="icon-sm"
        variant="ghost"
        onClick={dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
