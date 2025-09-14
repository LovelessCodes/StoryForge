import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useInstallations } from "@/stores/installations";

export const useConnectToServer = (
	props?: UseMutationOptions<
		void,
		Error,
		{ ip: string; password: string; installationId: number }
	>,
) => {
	const { installations, updateLastPlayed } = useInstallations();
	return useMutation({
		...props,
		mutationFn: ({ ip, password, installationId }) =>
			invoke("play_game", {
				options: { installation_id: installationId, password, server: ip },
			}),
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
