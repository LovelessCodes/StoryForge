export type UpdateWorldProps = {
	worldPath: string;
	name: string;
	installationId: number;
};

import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useUpdateWorld = (
	props?: UseMutationOptions<unknown, Error, UpdateWorldProps, unknown>,
) =>
	useMutation({
		mutationFn: ({ worldPath, name, installationId }: UpdateWorldProps) =>
			invoke("update_world", {
				installationId,
				name,
				worldPath,
			}),
		...props,
	});
