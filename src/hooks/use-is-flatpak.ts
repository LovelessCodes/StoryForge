import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

/**
 * Whether the app runs inside a Flatpak sandbox. Flatpak installs are updated
 * through Flathub, so the bundled updater is not registered and every update
 * check is a no-op.
 */
export const useIsFlatpak = (props?: UseQueryOptions<boolean, Error>) =>
  useQuery({
    // Outside Tauri (browser dev, screenshots) the command does not exist.
    queryFn: () => invoke<boolean>("is_flatpak_cmd").catch(() => false),
    queryKey: ["is-flatpak"],
    staleTime: Infinity,
    ...props,
  });
