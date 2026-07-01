import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type UpdateWorldProps = {
  worldPath: string;
  name: string;
  installationId: number;
  identifier?: string;
};

export const useUpdateWorld = (
  props?: UseMutationOptions<unknown, Error, UpdateWorldProps, unknown>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    mutationFn: ({ worldPath, name, installationId, identifier }: UpdateWorldProps) =>
      invoke("update_world", {
        identifier,
        installationId,
        name,
        worldPath,
      }),
    ...restProps,
    onSuccess: async (...args) => {
      const { installationId } = args[1];
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      void queryClient.invalidateQueries({ queryKey: ["saves", installationId] });
      onSuccess?.(...args);
    },
  });
};
