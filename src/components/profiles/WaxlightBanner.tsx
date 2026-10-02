import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useWaxlightInstances, waxlightInstancesQueryKey } from "@/hooks/use-waxlight-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Waxlight Launcher (AmadoMuerte) instances. */
export default function WaxlightBanner() {
  const { data } = useWaxlightInstances();
  const dismissed = useSettingsStore((s) => s.waxlightDismissed);
  const dismiss = useSettingsStore((s) => s.dismissWaxlight);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "Waxlight Launcher",
        hint: "Instances from Waxlight Launcher by AmadoMuerte (github.com/AmadoMuerte/Waxlight-launcher). Each one is imported as a profile — nothing is converted except the manifest.",
        note: "Waxlight covers are not carried over. Launch arguments, environment variables, pin state and playtime are preserved.",
        importCommand: "import_waxlight_instances",
        queryKey: waxlightInstancesQueryKey,
      }}
    />
  );
}
