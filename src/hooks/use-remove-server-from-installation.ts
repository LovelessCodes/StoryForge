export type RemoveServerFromInstallationProps = {
  server: string;
  installationId: number;
};

import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useRemoveServerFromInstallation = (
  props?: UseMutationOptions<unknown, Error, RemoveServerFromInstallationProps, unknown>,
) =>
  // callers refresh the server store; no query cache is involved
  // react-doctor-disable-next-line query-mutation-missing-invalidation
  useMutation({
    mutationFn: ({ server, installationId }: RemoveServerFromInstallationProps) =>
      invoke("remove_server_from_installation", {
        installationId,
        server,
      }),
    ...props,
  });
