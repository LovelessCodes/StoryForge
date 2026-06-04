import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { useId } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import { useDownloadVersion } from "@/hooks/use-download-version";
import {
  installedVersionsQueryKey,
  useInstalledVersionNames,
} from "@/hooks/use-installed-versions";
import { gameVersionsQuery } from "@/lib/queries";
import { buildInstallationPath, compareSemverDesc, makeStringFolderSafe } from "@/lib/utils";
import { useInstallationsStore } from "@/stores/installations";
import { useSettingsStore } from "@/stores/settings";

async function saveInstallationToDisk(installation: {
  name: string;
  path: string;
  version: string;
  startParams: string;
  favorite: boolean;
}) {
  await invoke("save_installation", {
    favorite: installation.favorite,
    name: installation.name,
    path: installation.path,
    startParams: installation.startParams,
    version: installation.version,
  });
}

export const installationSchema = z.object({
  favorite: z.boolean(),
  icon: z.string(),
  id: z.number(),
  index: z.number(),
  name: z.string().min(1, {
    message: "Name is required",
  }),
  path: z.string().min(1, {
    message: "Path is required",
  }),
  startParams: z.string(),
  version: z.string().min(1),
});

export type AddInstallationDialogProps = {
  version?: string;
};

export function AddInstallationDialog({ version }: AddInstallationDialogProps) {
  const id = useId();
  const { data: gameVersions } = useQuery(gameVersionsQuery);
  const { installationsParent, installationsSubdir } = useSettingsStore();
  const { appFolder } = useAppFolder();
  const { addInstallation, loadInstallations } = useInstallationsStore();
  const installedVersions = useInstalledVersionNames();
  const { mutateAsync: downloadVersion } = useDownloadVersion();
  const queryClient = useQueryClient();
  const { mutateAsync: initializeGame } = useMutation({
    mutationFn: (path: string) => invoke("initialize_game", { path }) as Promise<string>,
    onError: (error, path) => {
      toast.error(`Error initializing game: ${error}`, {
        id: `initialize-game-${path}`,
      });
    },
    onMutate: (path) => {
      toast.loading(`Initializing game...`, {
        id: `initialize-game-${path}`,
      });
    },
    onSuccess: async (_, path) => {
      await queryClient.invalidateQueries({ queryKey: installedVersionsQueryKey() });
      toast.success(`Game initialized`, {
        id: `initialize-game-${path}`,
      });
    },
  });
  const form = useForm({
    defaultValues: {
      favorite: false,
      icon: "",
      id: Date.now(),
      index: Date.now(),
      name: "",
      path: appFolder
        ? buildInstallationPath(installationsParent ?? appFolder, "new", installationsSubdir)
        : "",
      startParams: "",
      version:
        version ?? gameVersions?.sort(compareSemverDesc).filter((v) => !v.includes("rc"))[0] ?? "",
    },
    onSubmit: async ({ value }) => {
      if (!installedVersions.includes(value.version)) {
        await downloadVersion(value.version);
      }
      await initializeGame(value.path);
      const newId = Date.now();
      addInstallation(
        {
          favorite: value.favorite,
          icon: value.icon,
          id: newId,
          index: Date.now(),
          lastTimePlayed: 0,
          name: value.name,
          path: value.path,
          sizeBytes: 0,
          sizeDisplay: "...",
          startParams: value.startParams,
          totalTimePlayed: 0,
          version: value.version,
          modpackSlug: null,
          modpackVersion: null,
        },
        async (status) => {
          if (status) {
            await saveInstallationToDisk({
              favorite: value.favorite,
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
      <div className="flex flex-col items-center gap-2">
        <DialogHeader>
          <DialogTitle className="sm:text-center">Add installation</DialogTitle>
          <DialogDescription className="sm:text-center">
            Enter the new installation's details.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="space-y-5">
        <div className="space-y-4">
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
                      <p className="text-xs">Enter installation icon</p>
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
                />
                <Input
                  className={field.state.meta.errors.length ? "text-destructive" : ""}
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
                />
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
        </div>
        <Button
          className="w-full"
          disabled={form.state.isSubmitting}
          onClick={() => form.handleSubmit()}
          type="button"
        >
          {form.state.isSubmitting ? "Adding..." : "Add Installation"}
        </Button>
      </div>
    </>
  );
}
