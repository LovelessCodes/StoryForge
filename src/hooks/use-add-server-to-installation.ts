import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type AddServerToInstallationProps = {
  server: string;
  installationId: number;
};

export const useAddServerToInstallation = (
  props?: UseMutationOptions<unknown, Error, AddServerToInstallationProps, unknown>,
) =>
  // callers refresh the server store; no query cache is involved
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  useMutation({
    mutationFn: ({ server, installationId }: { server: string; installationId: number }) =>
      invoke("add_server_to_installation", {
        installationId,
        server,
      }),
    ...props,
  });
