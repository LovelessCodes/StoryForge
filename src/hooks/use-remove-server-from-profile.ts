export type RemoveServerFromProfileProps = {
  server: string;
  profileId: number;
};

import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useRemoveServerFromProfile = (
  props?: UseMutationOptions<unknown, Error, RemoveServerFromProfileProps, unknown>,
) =>
  // callers refresh the server store; no query cache is involved
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  useMutation({
    mutationFn: ({ server, profileId }: RemoveServerFromProfileProps) =>
      invoke("remove_server_from_profile", {
        profileId,
        server,
      }),
    ...props,
  });
