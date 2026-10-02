import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useCheckServerInProfile = (
  props?: UseMutationOptions<boolean, Error, { server: string; profileId: number }, unknown>,
) =>
  // boolean probe consumed inline by the connect flow; it caches nothing
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  useMutation({
    mutationFn: ({ server, profileId }: { server: string; profileId: number }) =>
      invoke("check_server_in_profile", {
        profileId,
        server,
      }) as Promise<boolean>,
    ...props,
  });
