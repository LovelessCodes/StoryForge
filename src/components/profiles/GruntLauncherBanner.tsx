import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useGruntLauncherInstances,
  gruntLauncherInstancesQueryKey,
} from "@/hooks/use-gruntlauncher-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for GruntLauncher (renarin-kholin) instances. */
export default function GruntLauncherBanner() {
  const { data } = useGruntLauncherInstances();
  const dismissed = useSettingsStore((s) => s.gruntLauncherDismissed);
  const dismiss = useSettingsStore((s) => s.dismissGruntLauncher);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "GruntLauncher",
        hint: "Instances from GruntLauncher by renarin-kholin. Each instance folder becomes a profile with its mods, settings and worlds.",
        note: "GruntLauncher's own instance file and mod logo cache are removed from the imported profile. Game versions from its installations folder can be linked on the Versions page.",
        importCommand: "import_gruntlauncher_instances",
        queryKey: gruntLauncherInstancesQueryKey,
      }}
    />
  );
}
