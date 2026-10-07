import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useWaxlightInstances, waxlightInstancesQueryKey } from "@/hooks/use-waxlight-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Waxlight Launcher (AmadoMuerte) instances. */
export default function WaxlightBanner() {
  const { t } = useTranslation();
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
        hint: t("profiles.banners.waxlight.hint"),
        note: t("profiles.banners.waxlight.note"),
        importCommand: "import_waxlight_instances",
        queryKey: waxlightInstancesQueryKey,
      }}
    />
  );
}
