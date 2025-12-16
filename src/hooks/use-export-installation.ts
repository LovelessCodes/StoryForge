import { toast } from "sonner";
import type { Installation } from "@/stores/installations";
import { useInstalledMods } from "./use-installed-mods";

export const useExportInstallation = (installation: Installation) => {
	const { data: installationMods } = useInstalledMods(installation.path);
	const data = {
		mods: installationMods?.mods.map((m) => ({
			id: m.modid,
			version: m.version,
		})),
		name: installation.name,
		version: installation.version,
	};

	function exportToClipboard() {
		navigator.clipboard.writeText(JSON.stringify(data, null, 2));
		toast.success("Installation copied to clipboard");
	}

	return { exportToClipboard };
};
