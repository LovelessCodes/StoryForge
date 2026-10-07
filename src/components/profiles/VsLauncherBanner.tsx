import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useVsLauncherInstallations,
  vsLauncherInstallationsQueryKey,
} from "@/hooks/use-vs-launcher-installations";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for VS Launcher (XurxoMF) installations. */
export default function VsLauncherBanner() {
  const { t } = useTranslation();
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
        hint: t("profiles.banners.vsLauncher.hint"),
        note: t("profiles.banners.vsLauncher.note"),
        importCommand: "import_vs_launcher_installations",
        queryKey: vsLauncherInstallationsQueryKey,
      }}
    />
  );
}
