import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useLithicInstances, lithicInstancesQueryKey } from "@/hooks/use-lithic-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Lithic (NotAShelf) instances. */
export default function LithicBanner() {
  const { data } = useLithicInstances();
  const dismissed = useSettingsStore((s) => s.lithicDismissed);
  const dismiss = useSettingsStore((s) => s.dismissLithic);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "Lithic",
        hint: "Instances from Lithic by NotAShelf (CLI and GUI). Each instance's data folder is imported as a profile.",
        note: "Instances are copied, never moved: the instance folder also holds Lithic's own settings and lock files. Playtime, launch arguments and environment variables are preserved; mods switched off in Lithic are copied to mods-disabled/ and stay off, and launch wrappers (gamemoderun, prime-run) are not carried over. Game builds can be linked on the Versions page.",
        importCommand: "import_lithic_instances",
        queryKey: lithicInstancesQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
