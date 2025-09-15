import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export const useVerifyAuth = (
	props?: UseMutationOptions<
		{
			valid: boolean;
			entitlements: string[];
			mptoken: string | null;
			hasgameserver: boolean;
			reason: string | null;
		},
		Error,
		{ uid: string; sessionkey: string }
	>,
) =>
	useMutation({
		mutationFn: async ({ uid, sessionkey }) =>
			invoke("auth_verify", { sessionkey, uid }),
		...props,
	});
