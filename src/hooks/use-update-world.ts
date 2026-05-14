import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type UpdateWorldProps = {
  worldPath: string;
  name: string;
  installationId: number;
  identifier?: string;
};

export const useUpdateWorld = (
  props?: UseMutationOptions<unknown, Error, UpdateWorldProps, unknown>,
) =>
  useMutation({
    mutationFn: ({ worldPath, name, installationId, identifier }: UpdateWorldProps) =>
      invoke("update_world", {
        identifier,
        installationId,
        name,
        worldPath,
      }),
    ...props,
  });
