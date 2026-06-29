import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { useId } from "react";

import { EnvVarsEditor, type EnvVarEntry } from "@/components/env-vars-editor";
import { InstallationIconPicker } from "@/components/pickers/installation-icon.picker";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useDownloadVersion } from "@/hooks/use-download-version";
import { useInstalledVersionNames } from "@/hooks/use-installed-versions";
import { logToFile } from "@/lib/logger";
import { gameVersionsQuery } from "@/lib/queries";
import { buildInstallationPath, compareSemverDesc, makeStringFolderSafe } from "@/lib/utils";
import { type Installation, useInstallationsStore } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

import { Tabs, TabsContent, TabsList, TabsTab } from "../ui/tabs";
import { installationSchema } from "./addinstallation.dialog";

async function saveInstallationToDisk(installation: {
  name: string;
  path: string;
  version: string;
  startParams: string;
  favorite: boolean;
  icon: string | null;
  envVars: Record<string, string> | null;
}) {
  await invoke("save_installation", {
    envVars: installation.envVars,
    favorite: installation.favorite,
    icon: installation.icon,
    name: installation.name,
    path: installation.path,
    startParams: installation.startParams,
    version: installation.version,
  });
}

export type EditInstallationDialogProps = {
  installation: Installation;
};

export function EditInstallationDialog({ installation }: EditInstallationDialogProps) {
  const id = useId();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const installedVersions = useInstalledVersionNames();
  const { appFolder } = useAppFolder();
  const { installationsParent, installationsSubdir } = useSettingsStore();
  const { updateInstallation, loadInstallations } = useInstallationsStore();
  const { mutateAsync: downloadVersion } = useDownloadVersion();
  const form = useForm({
    defaultValues: {
      envVars: Object.entries(installation.environmentVariables ?? {}).map(([key, value]) => ({
        key,
        value,
      })) as EnvVarEntry[],
      favorite: installation.favorite,
      icon: installation.icon ?? "",
      id: installation.id,
      index: installation.index,
      name: installation.name,
      path: installation.path,
      startParams: installation.startParams,
      version: installation.version ?? gameVersions?.[0] ?? "1.21.1",
    },
    onSubmit: async ({ value }) => {
      if (!installedVersions.includes(value.version)) {
        await downloadVersion(value.version);
      }
      updateInstallation(
        {
          favorite: value.favorite,
          icon: value.icon?.length ? value.icon : null,
          id: installation.id,
          index: installation.index,
          lastTimePlayed: installation.lastTimePlayed,
          name: value.name,
          path: value.path,
          sizeBytes: installation.sizeBytes,
          sizeDisplay: installation.sizeDisplay,
          startParams: value.startParams,
          totalTimePlayed: installation.totalTimePlayed,
          version: value.version,
          modpackSlug: installation.modpackSlug,
          modpackVersion: installation.modpackVersion,
        },
        async (status) => {
          if (status) {
            const safeName = makeStringFolderSafe(value.name);
            const oldSafeName = makeStringFolderSafe(installation.name);
            if (safeName !== oldSafeName) {
              const src = installationsParent ?? appFolder ?? "";
              await logToFile(
                "INFO ",
                `[edit_installation] rename: ${src}/${oldSafeName} -> ${src}/${safeName}`,
              );
              await invoke("rename_installations_folder", {
                newName: safeName,
                source: installationsParent ?? appFolder ?? "",
                subdir: oldSafeName,
              });
            }
            await saveInstallationToDisk({
              envVars: Object.fromEntries(
                value.envVars.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value]),
              ),
              favorite: value.favorite,
              icon: value.icon || null,
              name: value.name,
              path: value.path,
              startParams: value.startParams,
              version: value.version,
            });
            await loadInstallations();
            rootDialogHandle.close();
          }
        },
      );
    },
    validators: {
      onChange: installationSchema,
    },
  });
  return (
    <>
      <DialogClose />
      <Tabs>
        <TabsList>
          <TabsTab value="info">Info</TabsTab>
          <TabsTab value="advanced">Advanced</TabsTab>
        </TabsList>
        <TabsContent value="info" className="space-y-4">
          <form.Field name="name">
            {(field) => (
              <div className="grid gap-2">
                <TooltipTrigger
                  render={
                    <Label
                      className={clsx([
                        field.state.meta.errors.length ? "text-destructive" : "",
                        "w-fit",
                      ])}
                      htmlFor="name"
                    />
                  }
                  handle={rootTooltipHandle}
                  payload={() => (
                    <>
                      <p className="text-xs">Enter server name</p>
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
                  Name
                  <span className="text-destructive">*</span>
                </TooltipTrigger>
                <Input
                  className={field.state.meta.errors.length ? "text-destructive" : ""}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    if (e.target.value.length > 0 && appFolder) {
                      const safeName = makeStringFolderSafe(e.target.value);
                      form.setFieldValue(
                        "path",
                        buildInstallationPath(
                          installationsParent ?? appFolder,
                          safeName,
                          installationsSubdir,
                        ),
                      );
                    } else {
                      form.resetField("path");
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void form.handleSubmit();
                    }
                  }}
                  value={field.state.value}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="icon">
            {(field) => (
              <div className="grid gap-2">
                <TooltipTrigger
                  render={
                    <Label
                      className={clsx([
                        field.state.meta.errors.length ? "text-destructive" : "",
                        "w-fit",
                      ])}
                      htmlFor="icon"
                    />
                  }
                  handle={rootTooltipHandle}
                  payload={() => (
                    <>
                      <p className="text-xs">Pick an icon</p>
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
                  Icon
                  <span className="text-muted-foreground text-xs">(optional)</span>
                </TooltipTrigger>
                <InstallationIconPicker
                  onChange={(icon) => field.handleChange(icon ?? "")}
                  value={field.state.value || null}
                />
              </div>
            )}
          </form.Field>
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
                    <p>
                      {field.state.value ?? "Game version"}
                      {installedVersions.includes(field.state.value) ? (
                        <span className="text-muted-foreground ml-2 text-xs opacity-50">
                          (installed)
                        </span>
                      ) : (
                        <span className="text-muted-foreground ml-2 text-xs opacity-50">
                          (will be downloaded)
                        </span>
                      )}
                    </p>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {gameVersions?.sort(compareSemverDesc).map((version) => (
                      <SelectItem
                        className={installedVersions.includes(version) ? "bg-success/5" : ""}
                        key={version}
                        value={version}
                      >
                        {version}
                        {installedVersions.includes(version) && (
                          <span className="text-muted-foreground ml-2 text-xs opacity-50">
                            (installed)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </TabsContent>
        <TabsContent value="advanced" className="space-y-4">
          <form.Field name="startParams">
            {(field) => (
              <div className="grid gap-2">
                <div className="flex items-center">
                  <TooltipTrigger
                    render={
                      <Label
                        className={clsx([
                          field.state.meta.errors.length ? "text-destructive" : "",
                          "w-fit",
                        ])}
                        htmlFor="startParams"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Enter start parameters</p>
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
                    Start parameters
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </TooltipTrigger>
                </div>
                <Input
                  id={`${id}-start-params`}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onKeyUp={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void form.handleSubmit();
                    }
                  }}
                  value={field.state.value}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="envVars">
            {(field) => (
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label className="w-fit">
                    Environment variables
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                </div>
                <EnvVarsEditor
                  entries={field.state.value}
                  onChange={(entries) => field.handleChange(entries)}
                />
              </div>
            )}
          </form.Field>
          <form.Field name="path">
            {(field) => (
              <div className="grid gap-2">
                <TooltipTrigger
                  render={
                    <Label
                      className={clsx([
                        field.state.meta.errors.length ? "text-destructive" : "",
                        "w-fit",
                      ])}
                      htmlFor="path"
                    />
                  }
                  handle={rootTooltipHandle}
                  payload={() => (
                    <>
                      <p className="text-xs">Enter installation path</p>
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
                  Path
                  <span className="text-destructive">*</span>
                </TooltipTrigger>
                <Input
                  className={field.state.meta.errors.length ? "text-destructive" : ""}
                  disabled
                  value={field.state.value}
                />
              </div>
            )}
          </form.Field>
        </TabsContent>
      </Tabs>

      <Button
        className="mt-4 w-full"
        disabled={form.state.isSubmitting}
        onClick={() => form.handleSubmit()}
        type="button"
      >
        {form.state.isSubmitting ? "Updating..." : "Update Installation"}
      </Button>
    </>
  );
}
