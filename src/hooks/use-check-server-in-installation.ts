import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useCheckServerInInstallation = (
  props?: UseMutationOptions<boolean, Error, { server: string; installationId: number }, unknown>,
) =>
  useMutation({
    mutationFn: ({ server, installationId }: { server: string; installationId: number }) =>
      invoke("check_server_in_installation", {
        installationId,
        server,
      }) as Promise<boolean>,
    ...props,
  });
