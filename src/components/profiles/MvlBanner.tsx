import { useTranslation } from "react-i18next";

import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useMvlModpacks, mvlModpacksQueryKey } from "@/hooks/use-mvl-modpacks";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for MVL (scgm0) modpacks. */
export default function MvlBanner() {
  const { t } = useTranslation();
  const { data } = useMvlModpacks();
  const dismissed = useSettingsStore((s) => s.mvlDismissed);
  const dismiss = useSettingsStore((s) => s.dismissMvl);

  return (
    <LauncherImportBanner
      dismissed={dismissed}
      items={data ?? []}
      onDismiss={dismiss}
      source={{
        name: "MVL",
        hint: t("profiles.banners.mvl.hint"),
        note: t("profiles.banners.mvl.note"),
        importCommand: "import_mvl_modpacks",
        queryKey: mvlModpacksQueryKey,
      }}
    />
  );
}
