import { UserCheck, UserX, X } from "lucide-react";
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
import { isAuthorBlocked } from "@/lib/mod-blocklist";
import { toast } from "@/lib/notify";
import { useSettingsStore } from "@/stores/settings";

/**
 * Authors whose mods are hidden from the browse results.
 *
 * Blocking is a browse-side preference: it never touches installed mods, it
 * only keeps listings (and future releases) out of the mod list. Authors can
 * be added by name here or blocked from a mod row's context menu.
 */
export function BlockedAuthorsSheet({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation();
  const blockedAuthors = useSettingsStore((s) => s.blockedAuthors);
  const toggleBlockedAuthor = useSettingsStore((s) => s.toggleBlockedAuthor);
  const clearBlockedAuthors = useSettingsStore((s) => s.clearBlockedAuthors);
  const [name, setName] = useState("");

  const add = () => {
    const author = name.trim();
    if (!author) return;
    if (isAuthorBlocked(blockedAuthors, author)) {
      toast.info(t("mods.blocked.alreadyBlocked", { author }));
      return;
    }
    toggleBlockedAuthor(author);
    toast.success(t("mods.blocked.blockedToast", { author }));
    setName("");
  };

  const unblock = (author: string) => {
    toggleBlockedAuthor(author);
    toast.info(t("mods.blocked.unblockedToast", { author }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <UserX className="size-4" />
            {t("mods.blocked.title")}
          </SheetTitle>
          <SheetDescription>{t("mods.blocked.description")}</SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="blocked-author-name">
                {t("mods.blocked.add")}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="blocked-author-name"
                  placeholder={t("mods.blocked.addPlaceholder")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") add();
                  }}
                />
                <Button
                  disabled={name.trim().length === 0}
                  onClick={add}
                  size="sm"
                  variant="accent-primary"
                >
                  <UserX />
                  {t("mods.blocked.block")}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              {blockedAuthors.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t("mods.blocked.empty")}</p>
              ) : (
                blockedAuthors.map((author) => (
                  <div key={author} className="flex items-center gap-2 border p-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{author}</span>
                    <Button
                      aria-label={t("mods.blocked.unblock", { author })}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => unblock(author)}
                      size="icon-sm"
                      title={t("mods.blocked.unblock", { author })}
                      variant="ghost"
                    >
                      <X />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </ScrollArea>

        {blockedAuthors.length > 0 && (
          <SheetFooter className="border-t">
            <Button
              onClick={() => {
                clearBlockedAuthors();
                toast.success(t("mods.blocked.clearedToast"));
              }}
              size="sm"
              variant="outline"
            >
              <UserCheck />
              {t("mods.blocked.unblockAll")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
