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

/** Raw PNG bytes of one screenshot preview; `ScreenshotImage` renders them. */
export const useScreenshotImage = (path: string | null, size: number) =>
  useQuery({
    enabled: path !== null,
    queryFn: () => invoke<ArrayBuffer>("get_screenshot_thumbnail", { path, size }),
    gcTime: 5 * 60_000,
    queryKey: ["screenshotImage", path, size],
    staleTime: Infinity,
  });

/** Raw PNG bytes of the full-size screenshot for the in-app viewer. */
export const useScreenshotFull = (path: string | null) =>
  useQuery({
    enabled: path !== null,
    queryFn: () => invoke<ArrayBuffer>("read_screenshot", { path }),
    gcTime: 60_000,
    queryKey: ["screenshotFull", path],
    staleTime: Infinity,
  });
