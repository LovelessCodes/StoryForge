import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useRef } from "react";
import { toast } from "sonner";
import { useAccountStore } from "@/stores/accounts";
import { useInstallations } from "@/stores/installations";
import { useAddServerToInstallation } from "./use-add-server-to-installation";
import { useCheckServerInInstallation } from "./use-check-server-in-installation";

export const useConnectToServer = (
	props?: UseMutationOptions<
		void,
		Error,
		{
			name: string;
			ip: string;
			password: string;
			installationId: number;
			pub?: boolean;
		}
	>,
) => {
	const { installations, updateLastPlayed } = useInstallations();
	const { selectedUser } = useAccountStore();
	const { mutateAsync: addServer } = useAddServerToInstallation({
		onError: (error) => {
			throw error;
		},
	});
	const { mutateAsync } = useCheckServerInInstallation({
		onSuccess: async (data, variables) => {
			if (data === false) {
				await addServer({
					installationId: variables.installationId,
					server: variables.server,
				});
			}
		},
	});
	const listenRef = useRef<UnlistenFn>(null);
	return useMutation({
		...props,
		mutationFn: async ({ name, ip, password, installationId, pub }) => {
			// Validate that a user is selected before launching
			if (!selectedUser) {
				throw new Error(
					"No user account selected. Please sign in or select a user account before connecting to a server.",
				);
			}

			// Validate that the selected user has required credentials
			if (!selectedUser.uid || !selectedUser.sessionkey) {
				throw new Error(
					"Selected user account is missing required credentials. Please sign in again.",
				);
			}

			if (!pub) {
				await mutateAsync({
					installationId,
					server: `${name},${ip},${password ? password : ""}`,
				});
			}
			await invoke("play_game", {
				options: { installation_id: installationId, password, server: ip },
			});
		},
		onError: (error) => {
			toast.error(`Error connecting to server: ${error.message}`);
		},
		onMutate: async (variable) => {
			const installation = installations.find(
				(inst) => inst.id === variable.installationId,
			);
			listenRef.current = await listen<{
				status: string;
				reason?: string;
				version?: string;
				line?: string;
			}>(`launch-${variable.installationId}`, (event) => {
				const { status } = event.payload;
				if (status === "pending") {
					toast.loading(`Launching ${installation?.name}...`, {
						id: `launch-game-${variable.installationId}`,
					});
				}
				if (status === "success") {
					toast.success(
						`Launched ${installation?.name} and connecting to ${variable.name}!`,
						{
							description: event.payload.version
								? `Version: ${event.payload.version}`
								: undefined,
							id: `launch-game-${variable.installationId}`,
						},
					);
					updateLastPlayed(variable.installationId);
				}
				if (status === "error") {
					toast.error(`Error launching game: ${event.payload.reason}`, {
						id: `launch-game-${variable.installationId}`,
					});
				}
			});
		},
	});
};
