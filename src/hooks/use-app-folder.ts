import { useQuery } from "@tanstack/react-query";
import { appDataDir } from "@tauri-apps/api/path";

export const useAppFolder = () => {
	const { data: appFolder } = useQuery({
		queryFn: () => appDataDir(),
		queryKey: ["app-folder"],
	});
	return { appFolder: appFolder ?? null };
};
