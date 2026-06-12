import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type DirSizeInfo = {
  size_bytes: number;
  size_display: string;
};

export const useServerDataDirSize = (instanceId: number) => {
  return useQuery({
    queryFn: () =>
      invoke("get_server_data_dir_size", {
        instanceId,
      }) as Promise<DirSizeInfo>,
    queryKey: ["serverDataDirSize", instanceId],
    staleTime: 30_000, // 30 second cache
  });
};
