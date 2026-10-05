import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useYelloowstoneInstances,
  yelloowstoneInstancesQueryKey,
} from "@/hooks/use-yelloowstone-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Yelloowstone (jgwoolley/vintage-story-launcher). */
export default function YelloowstoneBanner() {
  const { t } = useTranslation();
  const { data } = useYelloowstoneInstances();
  const dismissed = useSettingsStore((s) => s.yelloowstoneDismissed);
  const dismiss = useSettingsStore((s) => s.dismissYelloowstone);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "Yelloowstone",
        hint: t("profiles.banners.yelloowstone.hint"),
        note: t("profiles.banners.yelloowstone.note"),
        importCommand: "import_yelloowstone_instances",
        queryKey: yelloowstoneInstancesQueryKey,
      }}
    />
  );
}
