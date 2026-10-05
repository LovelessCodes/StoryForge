import { useNavigate } from "@tanstack/react-router";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useEffect } from "react";

import { useSettingsStore } from "@/stores/settings";

/**
 * Routes `storyforge://install?mod=<id>` (and `sf://mod/<id>`) links to the
 * Mods page, where the pending id opens the add sheet. Best effort: a link
 * that cannot be parsed is ignored.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();
  const setPendingDeepLinkMod = useSettingsStore((s) => s.setPendingDeepLinkMod);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    function handle(url: string) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.protocol !== "storyforge:" && parsed.protocol !== "sf:") return;
      const fromPath = parsed.pathname.replace(/^\/+/, "");
      const modid = parsed.searchParams.get("mod") ?? (fromPath.length > 0 ? fromPath : null);
      const trimmed = modid?.trim();
      if (!trimmed) return;
      setPendingDeepLinkMod(trimmed);
      void navigate({ to: "/mods" });
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
  }, [navigate, setPendingDeepLinkMod]);

  return null;
}
