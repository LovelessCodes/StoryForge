import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useLithicInstances, lithicInstancesQueryKey } from "@/hooks/use-lithic-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Lithic (NotAShelf) instances. */
export default function LithicBanner() {
  const { t } = useTranslation();
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
        hint: t("profiles.banners.lithic.hint"),
        note: t("profiles.banners.lithic.note"),
        importCommand: "import_lithic_instances",
        queryKey: lithicInstancesQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
