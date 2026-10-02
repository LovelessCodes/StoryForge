import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type AddServerToProfileProps = {
  server: string;
  profileId: number;
};

export const useAddServerToProfile = (
  props?: UseMutationOptions<unknown, Error, AddServerToProfileProps, unknown>,
) =>
  // callers refresh the server store; no query cache is involved
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  useMutation({
    mutationFn: ({ server, profileId }: { server: string; profileId: number }) =>
      invoke("add_server_to_profile", {
        profileId,
        server,
      }),
    ...props,
  });
