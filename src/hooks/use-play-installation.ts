import type { UseMutationOptions } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";
import { useAccountStore } from "@/stores/accounts";
import { useInstallations } from "@/stores/installations";

export const usePlayInstallation = (
	props?: UseMutationOptions<void, Error, { id: number; save?: string }>,
) => {
	const listenRef = useRef<UnlistenFn>(null);
	const { installations, updateLastPlayed } = useInstallations();
	const { selectedUser } = useAccountStore();

	return useMutation({
		...props,
		mutationFn: ({ id, save }) => {
			// Validate that a user is selected before launching
			if (!selectedUser) {
				throw new Error(
					"No user account selected. Please sign in or select a user account before launching the game.",
				);
			}

			// Validate that the selected user has required credentials
			if (!selectedUser.uid || !selectedUser.sessionkey) {
				throw new Error(
					"Selected user account is missing required credentials. Please sign in again.",
				);
			}

			return invoke("play_game", { options: { installation_id: id, save } });
		},
		onError: (error) => {
			toast.error(`Error playing with installation: ${error.message}`);
		},
		onMutate: async (variable) => {
			const installation = installations.find(
				(inst) => inst.id === variable.id,
			);
			listenRef.current = await listen<{
				status: string;
				reason?: string;
				version?: string;
				line?: string;
			}>(`launch-${variable.id}`, (event) => {
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
							description: event.payload.version
								? `Version: ${event.payload.version}`
								: undefined,
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
			});
		},
	});
};
