import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type AddServerToInstallationProps = {
  server: string;
  installationId: number;
};

export const useAddServerToInstallation = (
  props?: UseMutationOptions<unknown, Error, AddServerToInstallationProps, unknown>,
) =>
  useMutation({
    mutationFn: ({ server, installationId }: { server: string; installationId: number }) =>
      invoke("add_server_to_installation", {
        installationId,
        server,
      }),
    ...props,
  });
