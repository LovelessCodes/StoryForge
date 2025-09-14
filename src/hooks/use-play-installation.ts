import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useInstallations } from "@/stores/installations";

export const usePlayInstallation = (
	props?: UseMutationOptions<void, Error, { id: number }>,
) => {
	const { installations, updateLastPlayed } = useInstallations();
	return useMutation({
		...props,
		mutationFn: ({ id }) =>
			invoke("play_game", { options: { installation_id: id } }),
		onError: (error) => {
			toast.error(`Error playing with installation: ${error.message}`);
		},
		onSuccess: (_, variable) => {
			const installation = installations.find(
				(inst) => inst.id === variable.id,
			);
			toast.success(`Playing with ${installation?.name}!`);
			updateLastPlayed(variable.id);
		},
	});
};
