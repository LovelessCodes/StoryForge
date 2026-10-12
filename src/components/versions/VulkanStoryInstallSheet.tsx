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
  useInstallVulkanStory,
  useVulkanStoryStatus,
  type VulkanStoryProgress,
} from "@/hooks/use-vulkanstory";
import { vulkanStoryVersionName } from "@/lib/helpers";

/** The four states the sheet body can be in, each its own component so no one
 * function has to carry the whole state table. */
function ManifestSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="h-3 w-56" />
    </div>
  );
}

function UnsupportedSystemBody() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <p className="text-sm">{t("versions.vulkanstory.sheet.unsupportedSystem")}</p>
      <p className="text-muted-foreground text-xs">
        {t("versions.vulkanstory.sheet.platformNote")}
      </p>
    </div>
  );
}

function ManifestUnavailableBody({
  isFetching,
  onRetry,
}: {
  isFetching: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      <p className="text-sm">{t("versions.vulkanstory.sheet.manifestUnavailable")}</p>
      <div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={onRetry}>
          {isFetching && <Loader2 className="animate-spin" />}
          {t("versions.vulkanstory.sheet.retry")}
        </Button>
      </div>
    </div>
  );
}

function NoBuildBody({ base }: { base: string }) {
  const { t } = useTranslation();
  return (
    <p className="text-sm">
      {t("versions.vulkanstory.sheet.noBuildForVersion", { version: base })}
    </p>
  );
}

function ReadyBody({
  base,
  manifestVersion,
  isUpdate,
  pending,
  progress,
  showCancelling,
  onCancel,
  onInstall,
}: {
  base: string;
  manifestVersion: string;
  isUpdate: boolean;
  pending: boolean;
  progress: VulkanStoryProgress | null;
  showCancelling: boolean;
  onCancel: () => void;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const actionLabel = t(isUpdate ? "versions.vulkanstory.update" : "versions.vulkanstory.install");
  return (
    <>
      <div className="bg-muted/40 grid gap-1 border p-3">
        <span className="font-mono text-xs font-medium">
          {t("versions.vulkanstory.sheet.summary", { version: manifestVersion, base })}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {t("versions.vulkanstory.sheet.copyNote")}
        </span>
      </div>

      {pending && (
        <div className="grid gap-2">
          <p className="text-xs">
            {progress
              ? t(`versions.vulkanstory.phase.${progress.phase}`)
              : t("versions.vulkanstory.phase.manifest")}
          </p>
          <Progress value={progress?.progress ?? 0} />
        </div>
      )}

      <SheetFooter className="p-0">
        {pending ? (
          <Button variant="outline" disabled={showCancelling} onClick={onCancel}>
            {showCancelling && <Loader2 className="animate-spin" />}
            {t("common.actions.cancel")}
          </Button>
        ) : (
          <Button variant="accent-primary" onClick={onInstall}>
            {actionLabel}
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

/**
 * Installs (or updates) VulkanStory for one game version.
 *
 * VulkanStory is a client renderer fork that is extracted beside the game
 * executable, and Story Forge versions are shared by profiles, so the Rust
 * side copies the version to `<version>+vulkanstory` and extracts the package
 * into the copy. The sheet only reports; the copy is named in the description
 * so nothing about that is a surprise.
 */
export function VulkanStoryInstallSheet({
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
  const {
    data: status,
    isPending,
    refetch,
    isFetching,
  } = useVulkanStoryStatus(open && !!baseVersion);
  const { data: versions } = useInstalledVersions();
  const install = useInstallVulkanStory();
  const [cancelling, setCancelling] = useState(false);

  const installedBuild = (versions ?? []).find((v) => v.name === vulkanStoryVersionName(base));
  const isUpdate = !!installedBuild;
  const pending = install.isPending;
  const showCancelling = cancelling && pending;

  const manifest = status?.manifest ?? null;
  const supported = !!manifest && manifest.supportedGameVersions.includes(base);

  let body;
  if (isPending) {
    body = <ManifestSkeleton />;
  } else if (!status?.platformSupported) {
    body = <UnsupportedSystemBody />;
  } else if (status.reason || !manifest) {
    body = <ManifestUnavailableBody isFetching={isFetching} onRetry={() => void refetch()} />;
  } else if (!supported) {
    body = <NoBuildBody base={base} />;
  } else {
    body = (
      <ReadyBody
        base={base}
        manifestVersion={manifest.vulkanstoryVersion}
        isUpdate={isUpdate}
        pending={pending}
        progress={install.progress}
        showCancelling={showCancelling}
        onCancel={() => {
          setCancelling(true);
          install.cancel();
        }}
        onInstall={() => {
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
      />
    );
  }

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
            {t(isUpdate ? "versions.vulkanstory.update" : "versions.vulkanstory.install")}
          </SheetTitle>
          <SheetDescription>
            {t("versions.vulkanstory.sheet.description", { version: base })}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 p-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
