import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useRustoryInstances, rustoryInstancesQueryKey } from "@/hooks/use-rustory-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Rustory (XurxoMF) instances. */
export default function RustoryBanner() {
  const { data } = useRustoryInstances();
  const dismissed = useSettingsStore((s) => s.rustoryDismissed);
  const dismiss = useSettingsStore((s) => s.dismissRustory);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "Rustory",
        hint: "Instances from Rustory by XurxoMF (rustory.xyz), the successor of VS Launcher. Each instance's game data folder is imported as a profile.",
        note: "Instances are copied, never moved: the instance folder also holds Rustory's own manifest and backups, so there is nothing to relocate without breaking Rustory. Playtime, launch parameters and environment variables are preserved. Game versions installed by Rustory can be linked on the Versions page.",
        importCommand: "import_rustory_instances",
        queryKey: rustoryInstancesQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
