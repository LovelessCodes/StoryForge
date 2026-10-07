import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerConfig, useWriteServerConfig } from "@/hooks/queries/server-hosting";
import "@/lib/monaco";
import { toast } from "@/lib/notify";

const Editor = lazy(() => import("@monaco-editor/react"));

export default function ServerConfigEditor({ instanceId }: { instanceId: number }) {
  const { t } = useTranslation();
  const { data: serverConfig } = useServerConfig(instanceId);
  const writeConfig = useWriteServerConfig();

  // Unsaved edits are a nullable override of the fetched value, so no effect
  // has to sync state when serverConfig arrives (or is refetched).
  const [edited, setEdited] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const config = edited ?? serverConfig ?? "";
  const original = saved ?? serverConfig ?? "";
  const hasChanges = config !== original;

  function handleSave() {
    if (config === original) {
      toast.info(t("hosting.config.noChanges"));
      return;
    }
    try {
      JSON.parse(config);
    } catch (err) {
      toast.error(t("hosting.config.saveFailed", { message: String(err) }));
      return;
    }
    writeConfig.mutate(
      { id: instanceId, json: config },
      {
        onSuccess: () => {
          setSaved(config);
          toast.success(t("hosting.config.saved"));
        },
        onError: (err) => toast.error(t("hosting.config.saveFailed", { message: String(err) })),
      },
    );
  }

  if (serverConfig === undefined) {
    return (
      <div className="flex h-[520px] flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    );
  }

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">{t("hosting.config.description")}</p>
        <div className="flex gap-2">
          <Button
            disabled={!hasChanges}
            size="sm"
            variant="outline"
            onClick={() => setEdited(original)}
          >
            {t("hosting.config.reset")}
          </Button>
          <Button
            disabled={!hasChanges || writeConfig.isPending}
            size="sm"
            variant="accent-primary"
            onClick={handleSave}
          >
            {writeConfig.isPending ? t("hosting.config.saving") : t("hosting.config.saveChanges")}
          </Button>
        </div>
      </div>
      <div className="h-[520px] border">
        <Suspense fallback={<Skeleton className="h-full" />}>
          <Editor
            height="100%"
            language="json"
            loading={<Skeleton className="h-full" />}
            options={{
              fontSize: 14,
              lineNumbers: "off",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
            theme={isDark ? "vs-dark" : "vs-light"}
            value={config}
            onChange={(value) => setEdited(value ?? "")}
          />
        </Suspense>
      </div>
    </div>
  );
}
