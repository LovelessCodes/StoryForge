import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";
import { useInstallations } from "@/stores/installations";

export const usePlayInstallation = (
	props?: UseMutationOptions<void, Error, { id: number; save?: string }>,
) => {
	const listenRef = useRef<UnlistenFn>(null);
	const { installations, updateLastPlayed } = useInstallations();
	return useMutation({
		...props,
		mutationFn: ({ id, save }) =>
			invoke("play_game", { options: { installation_id: id, save } }),
		onError: (error) => {
			toast.error(`Error playing with installation: ${error.message}`);
		},
		onMutate: async (variable) => {
			const installation = installations.find(
				(inst) => inst.id === variable.id,
			);
			listenRef.current = await listen<{ status: string; reason?: string }>(
				`launch-${variable.id}`,
				(event) => {
					const { status } = event.payload;
					if (status === "pending") {
						toast.loading(`Launching ${installation?.name}...`, {
							id: `launch-game-${variable.id}`,
						});
					}
					if (status === "success") {
						toast.success(
							`Launched${variable.save ? ` world ${variable.save} with` : ""} ${installation?.name}!`,
							{
								id: `launch-game-${variable.id}`,
							},
						);
						updateLastPlayed(variable.id);
					}
					if (status === "error") {
						toast.error(`Error launching game: ${event.payload.reason}`, {
							id: `launch-game-${variable.id}`,
						});
					}
				},
			);
		},
	});
};
