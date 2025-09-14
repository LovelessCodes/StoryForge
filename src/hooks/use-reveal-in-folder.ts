import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { toast } from "sonner";

export const useRevealInFolder = (
	props?: UseMutationOptions<string, Error, string>,
) => {
    const currentPlatform = platform();
	return useMutation({
		...props,
		mutationFn: (path: string) =>
			invoke("reveal_in_file_explorer", {
                path: currentPlatform === "windows"
                    ? path.replace(/\//g, "\\")
                    : path
                }) as Promise<string>,
		onError: (error) =>
			toast.error(`Failed to reveal in file explorer: ${error.message}`),
		onSuccess: () => toast.success(`Revealed in file explorer`),
	});
};
