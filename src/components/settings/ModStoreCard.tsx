import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { DatabaseIcon, FolderOpenIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { useSettingsStore } from "@/stores/settings";

type ModStoreStats = {
  enabled: boolean;
  path: string;
  blobCount: number;
  totalBytes: number;
  totalDisplay: string;
};

type OptimizeReport = {
  disabled: boolean;
  profiles: number;
  files: number;
  linked: number;
  alreadyLinked: number;
  copied: number;
  skipped: number;
  failed: number;
  reclaimedBytes: number;
  reclaimedDisplay: string;
  errors: string[];
};

type PruneReport = {
  scannedProfiles: number;
  scannedFiles: number;
  removed: number;
  freedBytes: number;
  freedDisplay: string;
  errors: string[];
};

const statsQueryKey = ["mod-store-stats"] as const;

function messageOf(error: unknown): string {
  return errorMessage(error);
}

export default function ModStoreCard() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.modStoreEnabled);
  const toggleEnabled = useSettingsStore((s) => s.toggleModStoreEnabled);
  const queryClient = useQueryClient();

  const stats = useQuery({
    queryKey: statsQueryKey,
    queryFn: () => invoke<ModStoreStats>("get_mod_store_stats"),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: statsQueryKey });
  }

  const optimize = useMutation({
    mutationFn: () => invoke<OptimizeReport>("optimize_mod_store"),
    onMutate: () => {
      toast.loading(t("settings.modStore.optimizing"), { id: "mod-store" });
    },
    onSuccess: (report) => {
      toast.dismiss("mod-store");
      if (report.disabled) {
        toast.info(t("settings.modStore.disabledHint"));
        return;
      }
      toast.success(
        t("settings.modStore.optimizeDone", {
          linked: report.linked,
          size: report.reclaimedDisplay,
        }),
      );
      if (report.errors.length > 0) {
        toast.warning(t("settings.modStore.optimizePartial", { failed: report.errors.length }));
      }
      refresh();
    },
    onError: (error) => {
      toast.error(t("settings.modStore.optimizeFailed", { message: messageOf(error) }), {
        id: "mod-store",
      });
    },
  });

  const prune = useMutation({
    mutationFn: () => invoke<PruneReport>("prune_mod_store"),
    onMutate: () => {
      toast.loading(t("settings.modStore.pruning"), { id: "mod-store" });
    },
    onSuccess: (report) => {
      toast.dismiss("mod-store");
      toast.success(
        t("settings.modStore.pruneDone", {
          count: report.removed,
          size: report.freedDisplay,
        }),
      );
      refresh();
    },
    onError: (error) => {
      toast.error(t("settings.modStore.pruneFailed", { message: messageOf(error) }), {
        id: "mod-store",
      });
    },
  });

  async function openStoreFolder() {
    const path = stats.data?.path;
    if (!path) return;
    try {
      await invoke("reveal_in_file_explorer", { path });
    } catch (error) {
      toast.error(t("settings.modStore.openFailed", { message: messageOf(error) }));
    }
  }

  const busy = optimize.isPending || prune.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseIcon className="size-4" />
          {t("settings.modStore.title")}
        </CardTitle>
        <CardDescription>{t("settings.modStore.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <span className="text-xs font-medium">{t("settings.modStore.enabled")}</span>
            <span className="text-muted-foreground text-[11px]">
              {t("settings.modStore.enabledDescription")}
            </span>
          </div>
          <Switch
            aria-label={t("settings.modStore.enabled")}
            checked={enabled}
            onCheckedChange={toggleEnabled}
          />
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs font-medium" htmlFor="modStorePath">
            {t("settings.modStore.location")}
          </label>
          <div className="flex gap-2">
            <Input
              className="font-mono text-[11px]"
              id="modStorePath"
              readOnly
              value={stats.data?.path ?? "…"}
            />
            <Button
              disabled={!stats.data?.path}
              onClick={() => void openStoreFolder()}
              variant="outline"
            >
              <FolderOpenIcon />
              {t("common.actions.open")}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px]">
            {stats.isError
              ? t("settings.modStore.statsFailed", { message: messageOf(stats.error) })
              : t("settings.modStore.stats", {
                  count: stats.data?.blobCount ?? 0,
                  size: stats.data?.totalDisplay ?? "0 B",
                })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!enabled || busy} onClick={() => optimize.mutate()} variant="outline">
            <SparklesIcon />
            {t("settings.modStore.optimize")}
          </Button>
          <Button disabled={busy} onClick={() => prune.mutate()} variant="outline">
            <Trash2Icon />
            {t("settings.modStore.prune")}
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px]">{t("settings.modStore.optimizeHint")}</p>
      </CardContent>
    </Card>
  );
}
