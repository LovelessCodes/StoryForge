import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type UpdateWorldProps = {
  worldPath: string;
  name: string;
  profileId: number;
  identifier?: string;
};

export const useUpdateWorld = (
  props?: UseMutationOptions<unknown, Error, UpdateWorldProps, unknown>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    mutationFn: ({ worldPath, name, profileId, identifier }: UpdateWorldProps) =>
      invoke("update_world", {
        identifier,
        profileId,
        name,
        worldPath,
      }),
    ...restProps,
    onSuccess: async (...args) => {
      const { profileId } = args[1];
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      void queryClient.invalidateQueries({ queryKey: ["saves", profileId] });
      onSuccess?.(...args);
    },
  });
};
