import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

/**
 * Check for app updates. When running inside Flatpak (which manages updates
 * via Flathub), the updater plugin is not registered and this returns null.
 */
export const useUpdater = (props?: UseQueryOptions<Update | null, Error, Update | null>) =>
  useQuery({
    queryFn: async () => {
      // Flatpak manages updates through Flathub — our updater plugin is
      // intentionally not registered in that environment.
      const isFlatpak = await invoke<boolean>("is_flatpak_cmd").catch(() => false);
      if (isFlatpak) return null;
      try {
        return await check();
      } catch {
        // Plugin not available (Flatpak, etc.) — return null gracefully
        return null;
      }
    },
    queryKey: ["updater"],
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...props,
  });
