import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useVsLauncherInstallations,
  vsLauncherInstallationsQueryKey,
} from "@/hooks/use-vs-launcher-installations";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for VS Launcher (XurxoMF) installations. */
export default function VsLauncherBanner() {
  const { data } = useVsLauncherInstallations();
  const dismissed = useSettingsStore((s) => s.vsLauncherDismissed);
  const dismiss = useSettingsStore((s) => s.dismissVsLauncher);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "VS Launcher / RiftLauncher",
        hint: "Installations from VS Launcher by XurxoMF and RiftLauncher by the Stratum team (its maintained continuation). Each one is imported as a profile — nothing is converted except the manifest.",
        note: "Icons are not carried over (both use their own artwork). Playtime, launch parameters and environment variables are preserved.",
        importCommand: "import_vs_launcher_installations",
        queryKey: vsLauncherInstallationsQueryKey,
      }}
    />
  );
}
