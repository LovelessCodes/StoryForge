import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { launcherLoginsQueryKey, useDetectedLogins } from "@/hooks/use-launcher-logins";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { useAccountStore } from "@/stores/accounts";

type ImportLoginsReport = {
  /** Sessions written to accounts.json. */
  imported: number;
  /** Labels of the sessions the auth server reported as expired. */
  expired: string[];
};

/** Import sessions saved by MVL, legacy VS Launcher/RiftLauncher configs or your own profiles. */
export default function ImportLoginsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isPending } = useDetectedLogins({ enabled: open });
  const [picked, setPicked] = useState<Set<string> | null>(null);

  // Reset the selection every time the sheet opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPicked(null);
  }

  // Everything is selected until the player unchecks something.
  const selected = picked ?? new Set((data ?? []).map((login) => login.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  const importLogins = useMutation({
    mutationFn: (ids: string[]) => invoke<ImportLoginsReport>("import_launcher_logins", { ids }),
    onError: (error) => {
      toast.error(t("auth.importLogins.failed"), { description: errorMessage(error) });
    },
    onSuccess: async (report) => {
      await useAccountStore.getState().loadAccounts();
      void queryClient.invalidateQueries({ queryKey: launcherLoginsQueryKey() });
      if (report.expired.length > 0) {
        toast.error(t("auth.importLogins.expiredSkipped"), {
          description: report.expired.join(", "),
        });
      }
      if (report.imported > 0) {
        toast.success(t("auth.importLogins.imported"));
      }
      onOpenChange(false);
    },
  });

  const count = selected.size;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("auth.importLogins.title")}</SheetTitle>
          <SheetDescription>{t("auth.importLogins.description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-2 p-4">
            {isPending ? (
              <p className="text-muted-foreground text-sm">…</p>
            ) : data && data.length > 0 ? (
              <>
                <div className="divide-y border">
                  {data.map((login) => {
                    const checked = selected.has(login.id);
                    return (
                      <button
                        className="hover:bg-muted/40 bg-card flex w-full items-center gap-3 p-3 text-left transition-colors"
                        key={login.id}
                        onClick={() => toggle(login.id)}
                        type="button"
                      >
                        <span
                          className={
                            checked
                              ? "border-accent-primary text-accent-primary flex size-4 shrink-0 items-center justify-center border"
                              : "border-border flex size-4 shrink-0 items-center justify-center border"
                          }
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{login.label}</span>
                          <span className="text-muted-foreground block truncate text-[11px]">
                            {login.detail ?? login.source}
                          </span>
                        </span>
                        <Badge className="shrink-0" variant="outline">
                          {login.source}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
                <p className="text-muted-foreground text-[11px]">{t("auth.importLogins.hint")}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">{t("auth.importLogins.empty")}</p>
            )}
          </div>
        </ScrollArea>
        <SheetFooter className="border-t">
          <div className="flex justify-end gap-2">
            <SheetClose render={<Button disabled={importLogins.isPending} variant="outline" />}>
              {t("common.actions.cancel")}
            </SheetClose>
            <Button
              disabled={count === 0 || importLogins.isPending}
              onClick={() => importLogins.mutate([...selected])}
              variant="accent-primary"
            >
              {importLogins.isPending && <Loader2 className="animate-spin" />}
              {t("auth.importLogins.submit")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
