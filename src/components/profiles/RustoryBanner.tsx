import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useRustoryInstances, rustoryInstancesQueryKey } from "@/hooks/use-rustory-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Rustory (XurxoMF) instances. */
export default function RustoryBanner() {
  const { t } = useTranslation();
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
        hint: t("profiles.banners.rustory.hint"),
        note: t("profiles.banners.rustory.note"),
        importCommand: "import_rustory_instances",
        queryKey: rustoryInstancesQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
