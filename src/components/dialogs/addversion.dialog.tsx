import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { platform } from "@tauri-apps/plugin-os";
import clsx from "clsx";
import z from "zod";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useDownloadManager } from "@/hooks/use-download-manager";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import { compareSemverDesc } from "@/lib/utils";
import { useDownloadStore } from "@/stores/downloads";

export const versionSchema = z.object({
  version: z.string().min(1),
});

export function AddVersionDialog() {
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedVersions = useInstalledVersionNames();
  const currentPlatform = platform();
  const { startDownload } = useDownloadManager();
  const entries = useDownloadStore((s) => s.entries);

  const availableVersions = gameVersions?.filter(
    (v) => !installedVersions.includes(v) && !Object.keys(entries).includes(v),
  );

  const sortedVersions = availableVersions?.sort(compareSemverDesc);

  const form = useForm({
    defaultValues: {
      version: sortedVersions?.filter((v) => !v.includes("rc"))[0] ?? "",
    },
    onSubmit: async ({ value }) => {
      startDownload(value.version);
      rootDialogHandle.close();
    },
    validators: {
      onChange: versionSchema,
    },
  });

  const version = useStore(form.store, (state) => state.values.version);
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <DialogHeader>
          <DialogTitle className="sm:text-center">Add Version</DialogTitle>
          <DialogDescription className="sm:text-center">Enter the new version.</DialogDescription>
        </DialogHeader>
      </div>
      {currentPlatform === "macos" &&
        sortedVersions &&
        sortedVersions?.indexOf(version) > sortedVersions?.indexOf("1.19.0") && (
          <div className="text-destructive">
            Warning: This version is below 1.19.0 and may not be compatible with MacOS.
            <br />
            Please refer to{" "}
            <a
              className="hover:text-primary underline"
              href="https://wiki.vintagestory.at/Installing_the_game_on_MacOS#Versions_prior_to_1.19.0:_set_up_using_Homebrew"
              rel="noreferrer"
              target="_blank"
            >
              this article
            </a>
            .
          </div>
        )}
      <div className="space-y-5">
        <div className="space-y-4">
          <form.Field name="version">
            {(field) => (
              <div className="grid gap-2">
                <TooltipTrigger
                  render={
                    <Label
                      className={clsx([
                        field.state.meta.errors.length ? "text-destructive" : "",
                        "w-fit",
                      ])}
                      htmlFor="version"
                    />
                  }
                  handle={rootTooltipHandle}
                  payload={() => (
                    <>
                      <p className="text-xs">Pick game version</p>
                      {field.state.meta.errors.length > 0 &&
                        field.state.meta.errors.map((error, index) => (
                          <p
                            className="text-destructive text-xs"
                            // biome-ignore lint/suspicious/noArrayIndexKey: Needed
                            key={index}
                          >
                            {error?.message}
                          </p>
                        ))}
                    </>
                  )}
                >
                  Version
                  <span className="text-destructive">*</span>
                </TooltipTrigger>
                <Select onValueChange={(v) => v && field.handleChange(v)} value={field.state.value}>
                  <SelectTrigger className="flex w-full gap-1 truncate">
                    {field.state.value ?? "Game version"}
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {availableVersions?.sort(compareSemverDesc).map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>
        <Button className="w-full" onClick={() => form.handleSubmit()} type="button">
          Add Version
        </Button>
      </div>
    </>
  );
}
