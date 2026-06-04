import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { appDataDir } from "@tauri-apps/api/path";

export const useAppFolder = () => {
  const { data: appFolder } = useQuery({
    queryFn: () => appDataDir(),
    queryKey: ["app-folder"],
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
  return { appFolder: appFolder ?? null };
};
