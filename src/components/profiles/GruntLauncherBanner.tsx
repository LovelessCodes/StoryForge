import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useGruntLauncherInstances,
  gruntLauncherInstancesQueryKey,
} from "@/hooks/use-gruntlauncher-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for GruntLauncher (renarin-kholin) instances. */
export default function GruntLauncherBanner() {
  const { t } = useTranslation();
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
        hint: t("profiles.banners.gruntLauncher.hint"),
        note: t("profiles.banners.gruntLauncher.note"),
        importCommand: "import_gruntlauncher_instances",
        queryKey: gruntLauncherInstancesQueryKey,
      }}
    />
  );
}
