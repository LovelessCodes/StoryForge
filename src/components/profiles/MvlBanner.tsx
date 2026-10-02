import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useMvlModpacks, mvlModpacksQueryKey } from "@/hooks/use-mvl-modpacks";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for MVL (scgm0) modpacks. */
export default function MvlBanner() {
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
        hint: "Modpacks from MVL by scgm0 (github.com/scgm0/MVL). Each one is imported as a profile — nothing is converted except the manifest.",
        note: "MVL's modpack icon and VSRun launch command are not carried over — Story Forge owns how profiles launch. Names, game versions, mods and worlds are preserved.",
        importCommand: "import_mvl_modpacks",
        queryKey: mvlModpacksQueryKey,
      }}
    />
  );
}
