import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { compareSemverDesc, isMac } from "@/lib/helpers";
import { hostPlatformQuery } from "@/lib/queries";

export const MAC_WIKI_URL =
  "https://wiki.vintagestory.at/index.php?title=Installing_Vintage_Story_on_macOS";

/** Versions before 1.19.0 need extra setup on every Mac. */
export function MacSetupWarning({ version }: { version: string }) {
  const { t } = useTranslation();
  if (!isMac || version === "" || compareSemverDesc(version, "1.19.0") <= 0) return null;

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{t("versions.add.macWarningTitle")}</AlertTitle>
      <AlertDescription>
        <Trans
          i18nKey="versions.add.macWarning"
          components={{
            wiki: (
              <a
                className="hover:text-foreground underline underline-offset-2"
                href={MAC_WIKI_URL}
                rel="noreferrer"
                target="_blank"
                onClick={(event) => {
                  event.preventDefault();
                  void openUrl(MAC_WIKI_URL);
                }}
              />
            ),
          }}
        />
      </AlertDescription>
    </Alert>
  );
}

/** Apple Silicon builds start at 1.22.3; older versions need Rosetta. */
export function MacIntelWarning({ version }: { version: string }) {
  const { t } = useTranslation();
  const { data: hostPlatform } = useQuery(hostPlatformQuery);

  const intelOnly =
    isMac &&
    hostPlatform?.appleSilicon === true &&
    version !== "" &&
    compareSemverDesc(version, "1.19.0") <= 0 &&
    compareSemverDesc(version, "1.22.3") > 0;
  if (!intelOnly) return null;

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{t("versions.add.macIntelWarningTitle")}</AlertTitle>
      <AlertDescription>
        {hostPlatform.rosettaAvailable
          ? t("versions.add.macIntelWarning")
          : t("versions.add.macRosettaMissing")}
      </AlertDescription>
    </Alert>
  );
}
