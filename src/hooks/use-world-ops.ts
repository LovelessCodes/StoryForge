import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export type DuplicateWorldProps = { profileId: number; worldPath: string; name: string };
export type BackupWorldProps = { profileId: number; worldPath: string; destPath: string };
export type ImportWorldProps = { profileId: number; sourcePath: string };

/** Shared wiring for the per-world commands: both save lists get invalidated. */
const useWorldMutation = <TProps extends { profileId: number }>(
  command: string,
  props?: UseMutationOptions<unknown, Error, TProps, unknown>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...restProps } = props ?? {};
  return useMutation({
    mutationFn: (variables: TProps) => invoke<unknown>(command, variables),
    ...restProps,
    onSuccess: async (...args) => {
      const { profileId } = args[1];
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      void queryClient.invalidateQueries({ queryKey: ["saves", profileId] });
      onSuccess?.(...args);
    },
  });
};

export const useDuplicateWorld = (
  props?: UseMutationOptions<unknown, Error, DuplicateWorldProps, unknown>,
) => useWorldMutation<DuplicateWorldProps>("duplicate_world", props);

export const useBackupWorld = (
  props?: UseMutationOptions<unknown, Error, BackupWorldProps, unknown>,
) => useWorldMutation<BackupWorldProps>("backup_world", props);

export const useImportWorld = (
  props?: UseMutationOptions<unknown, Error, ImportWorldProps, unknown>,
) => useWorldMutation<ImportWorldProps>("import_world", props);
