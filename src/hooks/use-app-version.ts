import { type UseQueryOptions, keepPreviousData, useQuery } from "@tanstack/react-query";
import { getVersion } from "@tauri-apps/api/app";

export const useAppVersion = (props?: UseQueryOptions<string, Error>) => {
  return useQuery({
    queryFn: () => getVersion(),
    queryKey: ["app-version"],
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    ...props,
  });
};
