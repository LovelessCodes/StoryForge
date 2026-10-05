import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { linkableVersionsQueryKey } from "@/hooks/use-linkable-versions";
import { pathBasename } from "@/lib/helpers";
import type { LinkVersionsReport } from "@/lib/types";

interface LinkExistingVersionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Manually link a game install that Story Forge cannot detect (another drive,
 * the stock launcher, a manually extracted zip…).
 */
export default function LinkExistingVersionSheet({
  open,
  onOpenChange,
}: LinkExistingVersionSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function browse() {
    const selected = await openFileDialog({
      directory: true,
      multiple: false,
      title: t("versions.linkExisting.selectFolderTitle"),
    });
    if (typeof selected !== "string") return;
    setPath(selected);
    if (!name.trim()) setName(pathBasename(selected));
    setError(null);
  }

  async function link() {
    setBusy(true);
    setError(null);
    try {
      const result = await invoke<LinkVersionsReport>("link_external_versions", {
        versions: [{ name: name.trim(), path: path.trim(), source: null }],
      });
      if (result.linked === 0) {
        setError(result.skipped[0]?.reason ?? t("versions.linkExisting.linkFailed"));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: linkableVersionsQueryKey });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("versions.linkExisting.title")}</SheetTitle>
          <SheetDescription>{t("versions.linkExisting.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("versions.linkExisting.folderLabel")}</span>
              <div className="flex items-center gap-2">
                <Input className="font-mono text-[11px]" placeholder="…" readOnly value={path} />
                <Button variant="outline" onClick={() => void browse()}>
                  <FolderSearch /> {t("common.actions.browse")}
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                {t("versions.linkExisting.folderHint")}
              </p>
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("versions.linkExisting.nameLabel")}</span>
              <Input
                className="font-mono"
                placeholder="1.21.3"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-muted-foreground text-[11px]">
                {t("versions.linkExisting.nameHint")}
              </p>
            </div>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={busy || !path.trim() || !name.trim()}
            onClick={() => void link()}
          >
            {busy ? t("versions.linking") : t("versions.linkExisting.submit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
