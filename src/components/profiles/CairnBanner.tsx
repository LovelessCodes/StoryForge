import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import { useCairnPacks, cairnPacksQueryKey } from "@/hooks/use-cairn-packs";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Cairn (cairns-gg) packs. */
export default function CairnBanner() {
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
        hint: "Packs from Cairn by cairns-gg (github.com/cairns-gg/cairn-app). Each pack is imported as a profile — its data folder and mods are copied.",
        note: "Packs are copied, never moved: the pack folder also holds Cairn's manifest and lock files, so there is nothing to relocate without breaking Cairn. Cairn keeps working with its packs unchanged.",
        importCommand: "import_cairn_packs",
        queryKey: cairnPacksQueryKey,
        modes: ["copy"],
      }}
    />
  );
}
