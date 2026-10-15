import { useTranslation } from "react-i18next";

import { Progress } from "@/components/ui/progress";
import type { ImportProgress } from "@/lib/types";

interface ImportProgressBarProps {
  /** Latest progress event of the running import, if any has arrived yet. */
  progress: ImportProgress | null;
}

/**
 * Names the folder an import is working on and shows how far it has got.
 *
 * The bar is indeterminate until the folder's size is known (the detection scan
 * measures it, so it usually is).
 */
export function ImportProgressBar({ progress }: ImportProgressBarProps) {
  const { t } = useTranslation();

  const percent = progress?.bytesTotal
    ? Math.min(100, Math.round((progress.bytes / progress.bytesTotal) * 100))
    : null;

  let label = t("profiles.import.progressStarting");
  if (progress) {
    const values = {
      folder: progress.folder,
      index: progress.index,
      total: progress.count,
    };
    switch (progress.phase) {
      case "copy":
        label = t("profiles.import.progressCopy", values);
        break;
      case "move":
        label = t("profiles.import.progressMove", values);
        break;
      case "convert":
        label = t("profiles.import.progressConvert", values);
        break;
      default:
        label = t("profiles.import.progressDone");
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs">{label}</p>
      <Progress value={percent} />
    </div>
  );
}
