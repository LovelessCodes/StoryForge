import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AccountSettings } from "@/components/account-settings";
import { LogViewer } from "@/components/log-viewer";
import { type SortBy, sortOptions } from "@/components/pages/mods-browser";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootTooltipHandle } from "@/handles";
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { logToFile } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { useInstallationsStore } from "@/stores/installations";
import { type SetParentConfigProps, useSettingsStore } from "@/stores/settings";

const sortByValues = Object.keys(sortOptions) as [SortBy, ...SortBy[]];

const settingsSchema = z.object({
  darkMode: z.boolean(),
  defaultModSortBy: z.enum(sortByValues),
  installationsParent: z.string().nullable(),
  streamMode: z.boolean(),
  useSystemDotnet: z.boolean(),
  versionsParent: z.string().nullable(),
});

export function SettingsPage() {
  const { appFolder } = useAppFolder();
  const queryClient = useQueryClient();

  // Stores
  const settingsStore = useSettingsStore();
  const { updateParent, removeAll } = useInstallationsStore();

  // States
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingField, setPendingField] = useState<
    "installationsParent" | "versionsParent" | "both" | null
  >(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [configs, setConfigs] = useState<{
    installationsParent: {
      moveCurrentData: boolean;
      deleteCurrentData: boolean;
    };
    versionsParent: { moveCurrentData: boolean; deleteCurrentData: boolean };
  } | null>(null);
  const [useAppDirectory, setUseAppDirectory] = useState(
    settingsStore.installationsParent === null && settingsStore.versionsParent === null,
  );

  // Mutations
  const { mutateAsync: setInstallationsParent } = useMutation({
    mutationFn: ({ path, config }: { path: string | null; config?: SetParentConfigProps }) =>
      settingsStore.setInstallationsParent(path, config),
    onError: (error, v) => {
      if (v.config?.moveCurrentData) {
        toast.error(`Failed to move installations folder: ${error.message}`, {
          id: "settings-save",
        });
      } else if (v.config?.deleteCurrentData) {
        toast.error(`Failed to delete installations data: ${error.message}`, {
          id: "settings-save",
        });
      } else {
        toast.error(`Failed to set installations folder: ${error.message}`, {
          id: "settings-save",
        });
      }
    },
    onMutate: (v) => {
      if (v.config?.moveCurrentData) {
        toast.loading("Moving installations folder...", {
          id: "settings-save",
        });
      } else if (v.config?.deleteCurrentData) {
        toast.loading("Deleting installations data...", {
          id: "settings-save",
        });
      } else {
        toast.loading("Setting installations folder...", {
          id: "settings-save",
        });
      }
    },
    onSuccess: async (_, v) => {
      if (v.config?.moveCurrentData) {
        toast.success("Installations folder moved", {
          id: "settings-save",
        });
        // Update all installations paths
        updateParent(v.path ?? appFolder ?? "");
      } else if (v.config?.deleteCurrentData) {
        toast.success("Installations data deleted", {
          id: "settings-save",
        });
        removeAll();
      } else {
        toast.success("Installations folder set", {
          id: "settings-save",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
    },
  });
  const { mutateAsync: setVersionsParent } = useMutation({
    mutationFn: ({ path, config }: { path: string | null; config?: SetParentConfigProps }) =>
      settingsStore.setVersionsParent(path, config),
    onError: (error, v) => {
      if (v.config?.moveCurrentData) {
        toast.error(`Failed to move versions folder: ${error.message}`, {
          id: "settings-save",
        });
      } else if (v.config?.deleteCurrentData) {
        toast.error(`Failed to delete versions data: ${error.message}`, {
          id: "settings-save",
        });
      } else {
        toast.error(`Failed to set versions folder: ${error.message}`, {
          id: "settings-save",
        });
      }
    },
    onMutate: (v) => {
      if (settingsStore.versionsParent !== v.path) {
        if (v.config?.moveCurrentData) {
          toast.loading("Moving versions folder...", {
            id: "settings-save",
          });
        } else if (v.config?.deleteCurrentData) {
          toast.loading("Deleting versions data...", {
            id: "settings-save",
          });
        } else {
          toast.loading("Setting versions folder...", {
            id: "settings-save",
          });
        }
      }
    },
    onSuccess: async (_, v) => {
      if (v.config?.moveCurrentData) {
        toast.success("Versions folder moved", {
          id: "settings-save",
        });
      } else if (v.config?.deleteCurrentData) {
        toast.success("Versions data deleted", {
          id: "settings-save",
        });
      } else {
        toast.success("Versions folder set", {
          id: "settings-save",
        });
      }
      void queryClient.invalidateQueries({
        queryKey: installedVersionsQueryKey(),
      });
    },
  });

  // Form
  const form = useForm({
    defaultValues: {
      darkMode: settingsStore.darkMode,
      defaultModSortBy: settingsStore.defaultModSortBy,
      installationsParent: settingsStore.installationsParent,
      streamMode: settingsStore.streamMode,
      useSystemDotnet: settingsStore.useSystemDotnet,
      versionsParent: settingsStore.versionsParent,
    },
    onSubmit: async ({ value }) => {
      if (
        !value.installationsParent ||
        value.installationsParent.trim() === "" ||
        value.installationsParent.trim() === appFolder
      ) {
        await setInstallationsParent({
          config: configs?.installationsParent,
          path: null,
        });
      } else if (value.installationsParent !== settingsStore.installationsParent) {
        await setInstallationsParent({
          config: configs?.installationsParent,
          path: value.installationsParent.trim(),
        });
      }
      if (
        !value.versionsParent ||
        value.versionsParent.trim() === "" ||
        value.versionsParent.trim() === appFolder
      ) {
        await setVersionsParent({
          config: configs?.versionsParent,
          path: null,
        });
      } else if (value.versionsParent !== settingsStore.versionsParent) {
        await setVersionsParent({
          config: configs?.versionsParent,
          path: value.versionsParent.trim(),
        });
      }
      if (value.streamMode !== settingsStore.streamMode) {
        settingsStore.toggleStreamMode();
      }
      if (value.defaultModSortBy !== settingsStore.defaultModSortBy) {
        settingsStore.setDefaultModSortBy(value.defaultModSortBy);
      }
      if (value.useSystemDotnet !== settingsStore.useSystemDotnet) {
        settingsStore.toggleUseSystemDotnet();
      }
      if (value.darkMode !== settingsStore.darkMode) {
        settingsStore.toggleDarkMode();
      }
      toast.success("Settings saved", {
        id: "settings-save",
      });
    },
    validators: {
      onChange: settingsSchema,
    },
  });

  // Functions
  const handleBrowse = async (fieldName: "installationsParent" | "versionsParent" | "both") => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: `Select ${fieldName === "installationsParent" ? "Installations" : fieldName === "versionsParent" ? "Versions" : "All"} Parent Directory`,
    });
    if (typeof selected === "string") {
      setPendingField(fieldName);
      setPendingPath(selected);
      setDialogOpen(true);
    }
  };
  const handleDialogChoice = async (choice: "keep" | "delete" | "move") => {
    if (!pendingField || !pendingPath) return;
    await logToFile(
      "INFO ",
      `[settings] Folder change: field=${pendingField} choice=${choice} path=${pendingPath}`,
    );
    const config =
      choice === "move"
        ? { deleteCurrentData: false, moveCurrentData: true }
        : choice === "delete"
          ? { deleteCurrentData: true, moveCurrentData: false }
          : { deleteCurrentData: false, moveCurrentData: false };
    if (pendingField === "installationsParent") {
      setConfigs({
        installationsParent: config,
        versionsParent: configs?.versionsParent ?? {
          deleteCurrentData: false,
          moveCurrentData: false,
        },
      });
      form.setFieldValue("installationsParent", pendingPath ?? "");
    } else if (pendingField === "versionsParent") {
      setConfigs({
        installationsParent: configs?.installationsParent ?? {
          deleteCurrentData: false,
          moveCurrentData: false,
        },
        versionsParent: config,
      });
      form.setFieldValue("versionsParent", pendingPath ?? "");
    } else {
      setConfigs({
        installationsParent: config,
        versionsParent: config,
      });
      form.setFieldValue("installationsParent", pendingPath ?? "");
      form.setFieldValue("versionsParent", pendingPath ?? "");
    }
    setDialogOpen(false);
    setPendingField(null);
    setPendingPath(null);
  };

  return (
    <ScrollArea scrollFade>
      <Tabs className="pt-0.5" defaultValue="client">
        <TabsList className="mx-2 mb-6">
          <TabsTab value="client">Client</TabsTab>
          <TabsTab value="account">Account</TabsTab>
        </TabsList>
        <TabsPanel value="client">
          <div className="flex flex-col gap-2 px-4 pb-10">
            <div className="mb-4 flex items-center gap-3">
              <Checkbox
                checked={useAppDirectory}
                id="useAppDirectory"
                onCheckedChange={(checked) => {
                  const useAppDir = checked === true;
                  setUseAppDirectory(useAppDir);
                  if (
                    useAppDir &&
                    (settingsStore.installationsParent !== null ||
                      settingsStore.versionsParent !== null)
                  ) {
                    setPendingField("both");
                    setPendingPath(appFolder);
                    setDialogOpen(true);
                  }
                }}
              />
              <Label htmlFor="useAppDirectory">
                Use App Data Directory for Installations and Versions
              </Label>
            </div>
            <form.Field name="installationsParent">
              {(field) => (
                <div className="grid gap-2">
                  <TooltipTrigger
                    render={
                      <Label
                        className={cn([
                          field.state.meta.errors.length
                            ? "text-destructive"
                            : useAppDirectory
                              ? "text-muted-foreground"
                              : "",
                          "w-fit",
                        ])}
                        htmlFor="installationsParent"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Defaults to the app data directory</p>
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
                    Installations Parent Directory
                  </TooltipTrigger>
                  <div className="flex gap-2">
                    <Input
                      className={field.state.meta.errors.length ? "text-destructive" : ""}
                      disabled={useAppDirectory || form.state.isSubmitting}
                      readOnly
                      value={useAppDirectory ? `${appFolder}` : (field.state.value ?? "")}
                    />
                    <Button
                      disabled={form.state.isSubmitting || useAppDirectory}
                      onClick={() => handleBrowse("installationsParent")}
                      variant="outline"
                    >
                      Browse
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>
            <form.Field name="versionsParent">
              {(field) => (
                <div className="grid gap-2">
                  <TooltipTrigger
                    render={
                      <Label
                        className={cn([
                          field.state.meta.errors.length
                            ? "text-destructive"
                            : useAppDirectory
                              ? "text-muted-foreground"
                              : "",
                          "w-fit",
                        ])}
                        htmlFor="versionsParent"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Defaults to the app data directory</p>
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
                    Versions Parent Directory
                  </TooltipTrigger>
                  <div className="flex gap-2">
                    <Input
                      className={field.state.meta.errors.length ? "text-destructive" : ""}
                      disabled={useAppDirectory || form.state.isSubmitting}
                      readOnly
                      value={useAppDirectory ? `${appFolder}` : (field.state.value ?? "")}
                    />
                    <Button
                      disabled={form.state.isSubmitting || useAppDirectory}
                      onClick={() => handleBrowse("versionsParent")}
                      variant="outline"
                    >
                      Browse
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>
            <form.Field name="streamMode">
              {(field) => (
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={field.state.value}
                    id="streamMode"
                    onCheckedChange={(checked) => {
                      field.handleChange(checked === true);
                    }}
                  />
                  <Label htmlFor="streamMode">Enable Stream Mode</Label>
                </div>
              )}
            </form.Field>
            <form.Field name="darkMode">
              {(field) => (
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={field.state.value}
                    id="darkMode"
                    onCheckedChange={(checked) => {
                      field.handleChange(checked === true);
                    }}
                  />
                  <Label htmlFor="darkMode">Enable Dark Mode</Label>
                </div>
              )}
            </form.Field>
            <form.Field name="useSystemDotnet">
              {(field) => (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={field.state.value}
                      id="useSystemDotnet"
                      onCheckedChange={(checked) => {
                        field.handleChange(checked === true);
                      }}
                    />
                    <Label htmlFor="useSystemDotnet">Check for installed .NET on system</Label>
                  </div>
                  <p className="text-muted-foreground pl-7 text-xs">
                    When enabled, the app will try to use your system's .NET runtime before
                    downloading its own.
                  </p>
                </div>
              )}
            </form.Field>
            <form.Field name="defaultModSortBy">
              {(field) => (
                <div className="grid gap-2">
                  <Label>Default Mod Sort</Label>
                  <Select
                    onValueChange={(value) => field.handleChange(value as SortBy)}
                    value={field.state.value}
                  >
                    <SelectTrigger>{sortOptions[field.state.value]}</SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {Object.entries(sortOptions).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            <form.Subscribe
              selector={(s) => ({
                isDefaultValue: s.isDefaultValue,
                isSubmitting: s.isSubmitting,
                isTouched: s.isTouched,
                isValid: s.isValid,
              })}
            >
              {(state) => (
                <Button
                  disabled={
                    state.isSubmitting || !state.isTouched || !state.isValid || state.isDefaultValue
                  }
                  onClick={() => form.handleSubmit()}
                >
                  Save Changes
                </Button>
              )}
            </form.Subscribe>
            <section className="border-t p-6">
              <LogViewer />
            </section>
          </div>
          <AlertDialog onOpenChange={setDialogOpen} open={dialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>How do you want to handle existing data?</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => handleDialogChoice("keep")}
                  variant="outline"
                >
                  Keep current data (do not move or delete)
                </Button>
                <Button
                  className="w-full"
                  onClick={() => handleDialogChoice("delete")}
                  variant="destructive"
                >
                  Delete current data from old location
                </Button>
                <Button
                  className="w-full"
                  onClick={() => handleDialogChoice("move")}
                  variant="default"
                >
                  Copy current data to new location
                </Button>
              </div>
              <AlertDialogFooter>
                <Button onClick={() => setDialogOpen(false)} variant="ghost">
                  Cancel
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsPanel>
        <TabsPanel value="account">
          <AccountSettings />
        </TabsPanel>
      </Tabs>
    </ScrollArea>
  );
}
