import { LauncherImportBanner } from "@/components/profiles/LauncherImportBanner";
import {
  useYelloowstoneInstances,
  yelloowstoneInstancesQueryKey,
} from "@/hooks/use-yelloowstone-instances";
import { useSettingsStore } from "@/stores/settings";

/** Import banner for Yelloowstone (jgwoolley/vintage-story-launcher). */
export default function YelloowstoneBanner() {
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
        hint: "Instances from Yelloowstone (jgwoolley/vintage-story-launcher). Each instance's data folder becomes a profile.",
        note: "The instance's runtime folder is a full game install: it is linked as a version, never moved, so Yelloowstone keeps working. Moving a data folder does remove it from Yelloowstone's list.",
        importCommand: "import_yelloowstone_instances",
        queryKey: yelloowstoneInstancesQueryKey,
      }}
    />
  );
}
