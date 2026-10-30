import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { check, type Update } from "@tauri-apps/plugin-updater";

import { useIsFlatpak } from "@/hooks/use-is-flatpak";

/**
 * Check for app updates. Disabled inside Flatpak, where Flathub manages
 * updates and the updater plugin is deliberately not registered.
 */
export const useUpdater = (props?: UseQueryOptions<Update | null, Error, Update | null>) => {
  const { data: isFlatpak } = useIsFlatpak();

  return useQuery({
    // Wait for the sandbox check: inside Flatpak the plugin is not registered.
    enabled: isFlatpak === false,
    queryFn: async () => {
      try {
        return await check();
      } catch {
        // Plugin not available (e.g. built without updater support).
        return null;
      }
    },
    queryKey: ["updater"],
    staleTime: 1000 * 60 * 5, // 5 minutes
    ...props,
  });
};
