import { CopyIcon } from "lucide-react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";

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
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";

interface DeleteModpackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  modpack: ModpackItem;
  onDeleted?: (slug: string) => void;
}

/** Delete a modpack after typing its slug to confirm. */
export default function DeleteModpackSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  modpack,
  onDeleted,
}: DeleteModpackSheetProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [, copy] = useCopyToClipboard();

  const canDelete = confirmText === modpack.slug;

  async function handleDelete() {
    setDeleting(true);
    try {
      await authClient.deleteModpack(modpack.slug);
      onDeleted?.(modpack.slug);
      onOpenChange(false);
    } catch (error) {
      const message = errorMessage(error);
      toast.error(t("modpacks.delete.failed"), { description: message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !deleting && onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("modpacks.delete.title")}</SheetTitle>
          <SheetDescription>
            <Trans i18nKey="modpacks.delete.description" values={{ name: modpack.name }} />
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-2 p-4">
            <label className="text-xs font-medium" htmlFor="delete-modpack-confirm">
              <Trans
                i18nKey="modpacks.delete.confirmLabel"
                values={{ slug: modpack.slug }}
                components={{
                  wrap: <span className="inline-flex items-center gap-1 align-middle" />,
                  code: <code className="bg-muted px-1 font-mono text-xs" />,
                  copy: (
                    <Button
                      aria-label={t("modpacks.delete.copyAria")}
                      className="text-muted-foreground"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => copy(modpack.slug)}
                    >
                      <CopyIcon className="size-3" />
                    </Button>
                  ),
                }}
              />
            </label>
            <Input
              autoFocus
              className="font-mono"
              disabled={deleting}
              id="delete-modpack-confirm"
              placeholder={modpack.slug}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canDelete) void handleDelete();
              }}
            />
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            disabled={!canDelete || deleting}
            variant="destructive"
            onClick={() => void handleDelete()}
          >
            {deleting ? t("modpacks.delete.pending") : t("modpacks.delete.submit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
