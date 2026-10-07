import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useCairnPacks, cairnPacksQueryKey } from "@/hooks/use-cairn-packs";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Cairn (cairns-gg) packs. */
export default function CairnBanner() {
  const { t } = useTranslation();
  const { data } = useCairnPacks();
  const dismissed = useSettingsStore((s) => s.cairnDismissed);
  const dismiss = useSettingsStore((s) => s.dismissCairn);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "Cairn",
        hint: t("profiles.banners.cairn.hint"),
        note: t("profiles.banners.cairn.note"),
        importCommand: "import_cairn_packs",
        queryKey: cairnPacksQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
