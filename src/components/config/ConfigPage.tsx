import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "cn";
import { FileJson2Icon, IdCardIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useActiveProfile } from "@/hooks/use-active-profile";
import { modConfigsQueryKey, useModConfigs } from "@/hooks/use-mod-configs";
import { toast } from "@/lib/notify";

import CodeEditor from "./CodeEditor";
import LiveEditor from "./LiveEditor";

type EditorMode = "live" | "code";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function ConfigPage() {
  const { t } = useTranslation();
  const { activeProfile } = useActiveProfile();
  const profileId = activeProfile?.id ?? -1;

  const {
    data: modConfigs,
    isLoading,
    error,
  } = useModConfigs(profileId, {
    enabled: !!activeProfile,
  });

  const [editorMode, setEditorMode] = useState<EditorMode>("live");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { mutate: save } = useMutation({
    mutationFn: async ({ file, newCode }: { file: string; newCode: string }) => {
      JSON.parse(newCode);
      return await invoke("save_mod_config", { profileId, file, newCode });
    },
    onError: (saveError) => {
      toast.error(t("config.toasts.saveFailed", { message: errorMessage(saveError) }), {
        id: "save-mod-config",
      });
    },
    onMutate: () => {
      toast.loading(t("config.toasts.saving"), { id: "save-mod-config" });
    },
    onSuccess: async () => {
      toast.success(t("config.toasts.saved"), { id: "save-mod-config" });
      void queryClient.invalidateQueries({ queryKey: modConfigsQueryKey(profileId) });
    },
  });

  if (!activeProfile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
        <IdCardIcon className="text-muted-foreground size-6" />
        <div>
          <p className="text-sm font-medium">{t("config.noActiveProfile")}</p>
          <p className="text-muted-foreground text-xs">{t("config.noActiveProfileDescription")}</p>
        </div>
        <Button render={<Link to="/profiles" />} size="sm" variant="accent-primary">
          {t("config.goToProfiles")}
        </Button>
      </div>
    );
  }

  const configs = modConfigs ?? [];
  const activeConfig =
    configs.find((config) => config.filename === selectedFile) ?? configs[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <ToggleGroup
          onValueChange={(value) => {
            const next = value[0];
            if (next === "live" || next === "code") setEditorMode(next);
          }}
          size="sm"
          value={[editorMode]}
          variant="outline"
        >
          <ToggleGroupItem value="live">{t("config.liveEditor")}</ToggleGroupItem>
          <ToggleGroupItem value="code">{t("config.codeEditor")}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isLoading && configs.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 border border-dashed p-10 text-xs">
          <Loader2Icon className="size-4 animate-spin" />
          {t("config.loading")}
        </div>
      ) : configs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <FileJson2Icon className="text-muted-foreground size-6" />
          <div>
            <p className="text-sm font-medium">{t("config.noConfigFiles")}</p>
            <p className="text-muted-foreground text-xs">
              {error
                ? t("config.readFailed", { message: errorMessage(error) })
                : t("config.noConfigFilesHint")}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 border">
          <div className="flex w-56 shrink-0 flex-col border-r">
            <div className="border-b px-3 py-2">
              <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("config.files")}
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="divide-y">
                {configs.map((config) => {
                  const isActive = config.filename === activeConfig?.filename;
                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/40",
                        isActive
                          ? "border-l-accent-primary bg-muted/60 text-foreground"
                          : "text-muted-foreground",
                      )}
                      key={config.filename}
                      onClick={() => setSelectedFile(config.filename)}
                      type="button"
                    >
                      <FileJson2Icon className="size-3.5 shrink-0" />
                      <span className="truncate font-mono text-[11px]">{config.filename}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="relative min-w-0 flex-1">
            {activeConfig &&
              (editorMode === "live" ? (
                <ScrollArea className="h-full" scrollFade>
                  <LiveEditor
                    code={activeConfig.content}
                    file={activeConfig.filename}
                    key={activeConfig.filename}
                    onSave={save}
                  />
                </ScrollArea>
              ) : (
                <CodeEditor
                  code={activeConfig.content}
                  file={activeConfig.filename}
                  key={activeConfig.filename}
                  onSave={save}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
