import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
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
	return useMutation({
		...props,
		mutationFn: async ({ name, ip, password, installationId, pub }) => {
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
		onSuccess: (_, variable) => {
			toast.success(
				`Connecting to ${variable.ip}${variable.password.length ? " with password" : " without password"} using ${installations.find((inst) => inst.id === variable.installationId)?.name}!`,
			);
			updateLastPlayed(variable.installationId);
		},
	});
};
