import { useNavigate } from "@tanstack/react-router";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useEffect } from "react";

import { parseDeepLink } from "@/lib/deep-link";
import { useSettingsStore } from "@/stores/settings";

/**
 * Routes deep links to the page that can act on them:
 *
 * - `storyforge://install?mod=<id>` (and the `sf:` forms) queues a mod id and
 *   opens the Mods page, where the add sheet opens for it.
 * - `storyforge://install?pack=<slug>` (and the `sf:` forms) queues a modpack
 *   slug and opens the Modpacks page, where the detail sheet opens for it.
 *
 * Best effort: a link that cannot be parsed is ignored.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();
  const setPendingDeepLinkMod = useSettingsStore((s) => s.setPendingDeepLinkMod);
  const setPendingDeepLinkPack = useSettingsStore((s) => s.setPendingDeepLinkPack);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    function handle(url: string) {
      const link = parseDeepLink(url);
      if (!link) return;
      if (link.kind === "pack") {
        setPendingDeepLinkPack(link.slug);
        void navigate({ to: "/modpacks" });
      } else {
        setPendingDeepLinkMod(link.modid);
        void navigate({ to: "/mods" });
      }
    }

    void (async () => {
      try {
        const current = (await getCurrent()) ?? [];
        if (cancelled) return;
        for (const url of current) handle(url);
        unlisten = await onOpenUrl((urls) => {
          for (const url of urls) handle(url);
        });
      } catch {
        // Deep links are optional; never block startup over them.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate, setPendingDeepLinkMod, setPendingDeepLinkPack]);

  return null;
}
