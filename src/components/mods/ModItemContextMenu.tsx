import type { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { UserX } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "@/lib/notify";
import type { Mod } from "@/lib/types";
import { useSettingsStore } from "@/stores/settings";

/**
 * The right-click menu of a mod row. ModList wraps each row with it, so the
 * whole row is the trigger and the menu sits outside the row's markup.
 */
export function ModItemContextMenu({
  mod,
  ...props
}: ContextMenuPrimitive.Trigger.Props & { mod: Mod }) {
  const { t } = useTranslation();
  const toggleBlockedAuthor = useSettingsStore((s) => s.toggleBlockedAuthor);

  const blockAuthor = () => {
    toggleBlockedAuthor(mod.author);
    toast.success(t("mods.blocked.blockedToast", { author: mod.author }), {
      action: {
        label: t("mods.blocked.undo"),
        onClick: () => toggleBlockedAuthor(mod.author),
      },
      id: `block-author-${mod.author.toLowerCase()}`,
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger {...props} />
      <ContextMenuContent>
        <ContextMenuItem onClick={blockAuthor}>
          <UserX />
          {t("mods.blocked.blockAuthor", { author: mod.author })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
