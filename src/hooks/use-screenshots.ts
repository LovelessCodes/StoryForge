import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type ScreenshotInfo = {
  path: string;
  name: string;
  size: number;
  modified: number;
};

export const screenshotsQueryKey = (profileId: number) => ["screenshots", profileId];

export const useProfileScreenshots = (
  profileId: number,
  props?: Omit<UseQueryOptions<ScreenshotInfo[], Error, ScreenshotInfo[]>, "queryKey" | "queryFn">,
) =>
  useQuery({
    queryFn: () => invoke("get_profile_screenshots", { profileId }) as Promise<ScreenshotInfo[]>,
    queryKey: screenshotsQueryKey(profileId),
    staleTime: 30_000,
    ...props,
  });

/** A PNG preview of one screenshot (raw bytes over IPC, then a blob URL). */
export const useScreenshotImage = (path: string | null, size: number) =>
  useQuery({
    enabled: path !== null,
    queryFn: async () => {
      const bytes = await invoke<ArrayBuffer>("get_screenshot_thumbnail", { path, size });
      return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    },
    gcTime: 5 * 60_000,
    queryKey: ["screenshotImage", path, size],
    staleTime: Infinity,
  });

/** The full-size screenshot for the in-app viewer. */
export const useScreenshotFull = (path: string | null) =>
  useQuery({
    enabled: path !== null,
    queryFn: async () => {
      const bytes = await invoke<ArrayBuffer>("read_screenshot", { path });
      return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    },
    gcTime: 60_000,
    queryKey: ["screenshotFull", path],
    staleTime: Infinity,
  });
