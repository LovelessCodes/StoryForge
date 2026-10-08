import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Link2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { linkableVersionsQueryKey, useLinkableVersions } from "@/hooks/use-linkable-versions";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";
import type { LinkVersionsReport } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

/**
 * Banner + sheet that link game versions already installed by another
 * launcher. Linking registers the folder in place — nothing is copied,
 * moved or deleted.
 */
export default function LinkVersionsBanner() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: detected } = useLinkableVersions();
  const dismissed = useSettingsStore((s) => s.linkVersionsDismissed);
  const dismiss = useSettingsStore((s) => s.dismissLinkVersions);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<LinkVersionsReport | null>(null);

  const pending = (detected ?? []).filter((item) => !item.linked && !item.installed);

  async function linkAll() {
    setBusy(true);
    try {
      const result = await invoke<LinkVersionsReport>("link_external_versions", {
        versions: pending.map((item) => ({
          name: item.name,
          path: item.path,
          source: item.source,
        })),
      });
      setReport(result);
      await queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: linkableVersionsQueryKey });
      if (result.skipped.length > 0) {
        toast.error(t("versions.toast.linkSkipped", { count: result.skipped.length }), {
          description: result.skipped.map((skip) => `${skip.name}: ${skip.reason}`).join(", "),
        });
      } else {
        setOpen(false);
      }
    } catch (error) {
      const message = errorMessage(error);
      toast.error(t("versions.toast.linkFailed"), { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!dismissed && pending.length > 0 && (
        <div className="border-accent-primary/30 bg-accent-primary/5 flex flex-wrap items-center gap-3 border p-3">
          <Link2 className="text-accent-primary size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">
              {t("versions.banner.found", { count: pending.length })}
            </p>
            <p className="text-muted-foreground text-[11px]">{t("versions.banner.hint")}</p>
          </div>
          <Button
            size="sm"
            variant="accent-primary"
            onClick={() => {
              setReport(null);
              setOpen(true);
            }}
          >
            {t("versions.banner.action")}
          </Button>
          <Button
            aria-label={t("common.actions.dismiss")}
            size="icon-sm"
            variant="ghost"
            onClick={dismiss}
          >
            <X />
          </Button>
        </div>
      )}

      <Sheet open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>{t("versions.banner.title")}</SheetTitle>
            <SheetDescription>{t("versions.banner.description")}</SheetDescription>
          </SheetHeader>

          <ScrollArea scrollFade className="min-h-0 flex-1">
            <div className="grid gap-4 p-4">
              <div className="divide-y border">
                {(detected ?? []).map((item) => (
                  <div key={item.path} className="grid gap-1 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium">{item.name}</span>
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        {item.source}
                      </Badge>
                      {item.installed && (
                        <span className="text-muted-foreground text-[11px]">
                          {t("versions.banner.alreadyInstalled")}
                        </span>
                      )}
                      {item.linked && (
                        <span className="text-[11px] text-[var(--color-success)]">
                          {t("versions.linked")}
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground truncate text-[11px]" title={item.path}>
                      {item.path}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-muted-foreground text-[11px]">{t("versions.banner.note")}</p>

              {report && report.skipped.length > 0 && (
                <div className="border-destructive/30 bg-destructive/5 border p-3">
                  <p className="text-destructive text-xs font-medium">
                    {t("versions.banner.skipped", { count: report.skipped.length })}
                  </p>
                  <ul className="text-muted-foreground mt-1 grid gap-0.5 text-[11px]">
                    {report.skipped.map((skip) => (
                      <li key={skip.name}>
                        <span className="text-foreground font-medium">{skip.name}</span>:{" "}
                        {skip.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="border-t">
            <Button
              variant="accent-primary"
              disabled={busy || pending.length === 0}
              onClick={() => void linkAll()}
            >
              {busy
                ? t("versions.linking")
                : t("versions.banner.linkVersions", { count: pending.length })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
