export type RemoveServerFromInstallationProps = {
  server: string;
  installationId: number;
};

import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useRemoveServerFromInstallation = (
  props?: UseMutationOptions<unknown, Error, RemoveServerFromInstallationProps, unknown>,
) =>
  useMutation({
    mutationFn: ({ server, installationId }: RemoveServerFromInstallationProps) =>
      invoke("remove_server_from_installation", {
        installationId,
        server,
      }),
    ...props,
  });
