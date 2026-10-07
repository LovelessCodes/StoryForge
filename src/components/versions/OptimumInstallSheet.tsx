import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstalledVersions } from "@/hooks/use-installed-versions";
import {
  useInstallOptimum,
  useOptimumStatus,
  type OptimumProgressPhase,
} from "@/hooks/use-optimum";
import { optimumVersionName } from "@/lib/helpers";

/**
 * Installs (or updates) Optimum for one game version.
 *
 * Optimum is a client fork that patches a game folder, and Story Forge versions
 * are shared by profiles, so the Rust side copies the version to
 * `<version>+optimum` and patches the copy. The sheet only reports; the copy is
 * named in the description so nothing about that is a surprise.
 */
export function OptimumInstallSheet({
  baseVersion,
  open,
  onOpenChange,
}: {
  baseVersion: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const base = baseVersion ?? "";
  const { data: status, isPending, refetch, isFetching } = useOptimumStatus(open && !!baseVersion);
  const { data: versions } = useInstalledVersions();
  const install = useInstallOptimum();
  const [cancelling, setCancelling] = useState(false);

  const installedBuild = (versions ?? []).find((v) => v.name === optimumVersionName(base));
  const isUpdate = !!installedBuild;
  const pending = install.isPending;
  const progress = install.progress;
  const showCancelling = cancelling && pending;

  const manifest = status?.manifest ?? null;
  const supported = !!manifest && manifest.supportedGameVersions.includes(base);

  const phaseLabel = (phase: OptimumProgressPhase) => t(`versions.optimum.phase.${phase}`);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {t(isUpdate ? "versions.optimum.update" : "versions.optimum.install")}
          </SheetTitle>
          <SheetDescription>
            {t("versions.optimum.sheet.description", { version: base })}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 p-4">
          {isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          ) : !status?.platformSupported ? (
            <div className="grid gap-1.5">
              <p className="text-sm">{t("versions.optimum.sheet.unsupportedSystem")}</p>
              <p className="text-muted-foreground text-xs">
                {t("versions.optimum.sheet.platformNote")}
              </p>
            </div>
          ) : status.reason || !manifest ? (
            <div className="grid gap-3">
              <p className="text-sm">{t("versions.optimum.sheet.manifestUnavailable")}</p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                >
                  {isFetching && <Loader2 className="animate-spin" />}
                  {t("versions.optimum.sheet.retry")}
                </Button>
              </div>
            </div>
          ) : !supported ? (
            <p className="text-sm">
              {t("versions.optimum.sheet.noBuildForVersion", { version: base })}
            </p>
          ) : (
            <>
              <div className="bg-muted/40 grid gap-1 border p-3">
                <span className="font-mono text-xs font-medium">
                  {t("versions.optimum.sheet.summary", {
                    version: manifest.optimumVersion,
                    base,
                  })}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {t("versions.optimum.sheet.copyNote")}
                </span>
              </div>

              {pending && (
                <div className="grid gap-2">
                  <p className="text-xs">
                    {progress ? phaseLabel(progress.phase) : t("versions.optimum.phase.manifest")}
                  </p>
                  <Progress value={progress?.progress ?? 0} />
                </div>
              )}

              <SheetFooter className="p-0">
                {pending ? (
                  <Button
                    variant="outline"
                    disabled={showCancelling}
                    onClick={() => {
                      setCancelling(true);
                      install.cancel();
                    }}
                  >
                    {showCancelling && <Loader2 className="animate-spin" />}
                    {t("common.actions.cancel")}
                  </Button>
                ) : (
                  <Button
                    variant="accent-primary"
                    onClick={() => {
                      setCancelling(false);
                      install.mutate(
                        { baseVersion: base },
                        {
                          onSuccess: () => {
                            onOpenChange(false);
                            install.reset();
                          },
                        },
                      );
                    }}
                  >
                    {t(isUpdate ? "versions.optimum.update" : "versions.optimum.install")}
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
