import { type AnyFieldApi, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { AccountSettings } from "@/components/account-settings";
import { FieldLabelTooltip } from "@/components/inputs/field-label.tooltip";
import { LogViewer } from "@/components/log-viewer";
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
import { useAppFolder } from "@/hooks/use-app-folder";
import { installedVersionsQueryKey } from "@/hooks/use-installed-versions";
import { logToFile } from "@/lib/logger";
import { type SortBy, sortOptions } from "@/lib/mod-sort";
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

function ClientSettingsPanel() {
  // Stores
  const settingsStore = useSettingsStore();

  // States
  const [dialogOpen, setDialogOpen] = useState(false);
  // Only read by handleDialogChoice, never rendered: refs avoid a redraw.
  const pendingFieldRef = useRef<"installationsParent" | "versionsParent" | "both" | null>(null);
  const pendingPathRef = useRef<string | null>(null);
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
  const { appFolder, setInstallationsParent, setVersionsParent } = useParentDirectoryMutations();

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
      pendingFieldRef.current = fieldName;
      pendingPathRef.current = selected;
      setDialogOpen(true);
    }
  };
  const handleDialogChoice = async (choice: "keep" | "delete" | "move") => {
    const pendingField = pendingFieldRef.current;
    const pendingPath = pendingPathRef.current;
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
    pendingFieldRef.current = null;
    pendingPathRef.current = null;
  };

  return (
    <>
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
                pendingFieldRef.current = "both";
                pendingPathRef.current = appFolder;
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
            <ParentDirectoryField
              appFolder={appFolder}
              disabled={useAppDirectory || form.state.isSubmitting}
              field={field}
              htmlFor="installationsParent"
              label="                    Installations Parent Directory"
              muted={useAppDirectory}
              onBrowse={() => handleBrowse("installationsParent")}
            />
          )}
        </form.Field>
        <form.Field name="versionsParent">
          {(field) => (
            <ParentDirectoryField
              appFolder={appFolder}
              disabled={useAppDirectory || form.state.isSubmitting}
              field={field}
              htmlFor="versionsParent"
              label="                    Versions Parent Directory"
              muted={useAppDirectory}
              onBrowse={() => handleBrowse("versionsParent")}
            />
          )}
        </form.Field>
        <form.Field name="streamMode">
          {(field) => (
            <SettingsCheckboxField field={field} id="streamMode" label="Enable Stream Mode" />
          )}
        </form.Field>
        <form.Field name="darkMode">
          {(field) => (
            <SettingsCheckboxField field={field} id="darkMode" label="Enable Dark Mode" />
          )}
        </form.Field>
        <form.Field name="useSystemDotnet">
          {(field) => (
            <SettingsCheckboxField
              description="When enabled, the app will try to use your system's .NET runtime before downloading its own."
              field={field}
              id="useSystemDotnet"
              label="Check for installed .NET on system"
            />
          )}
        </form.Field>
        <form.Field name="defaultModSortBy">
          {(field) => <DefaultModSortField field={field} />}
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
      <ExistingDataDialog
        onChoose={handleDialogChoice}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
      />
    </>
  );
}

export function SettingsPage() {
  return (
    <ScrollArea scrollFade>
      <Tabs className="pt-0.5" defaultValue="client">
        <TabsList className="mx-2 mb-6">
          <TabsTab value="client">Client</TabsTab>
          <TabsTab value="account">Account</TabsTab>
        </TabsList>
        <TabsPanel value="client">
          <ClientSettingsPanel />
        </TabsPanel>
        <TabsPanel value="account">
          <AccountSettings />
        </TabsPanel>
      </Tabs>
    </ScrollArea>
  );
}

/** Parent-directory mutations, toasts included. */
function useParentDirectoryMutations() {
  const { appFolder } = useAppFolder();
  const queryClient = useQueryClient();
  const settingsStore = useSettingsStore();
  const updateParent = useInstallationsStore((s) => s.updateParent);
  const removeAll = useInstallationsStore((s) => s.removeAll);

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

  return { appFolder, setInstallationsParent, setVersionsParent };
}

/** Asks how to treat data in the previous parent directory. */
function ExistingDataDialog({
  onChoose,
  onOpenChange,
  open,
}: {
  onChoose: (choice: "keep" | "delete" | "move") => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>How do you want to handle existing data?</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Button className="w-full" onClick={() => onChoose("keep")} variant="outline">
            Keep current data (do not move or delete)
          </Button>
          <Button className="w-full" onClick={() => onChoose("delete")} variant="destructive">
            Delete current data from old location
          </Button>
          <Button className="w-full" onClick={() => onChoose("move")} variant="default">
            Copy current data to new location
          </Button>
        </div>
        <AlertDialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ParentDirectoryField({
  appFolder,
  disabled,
  field,
  htmlFor,
  label,
  muted,
  onBrowse,
}: {
  appFolder: string | null | undefined;
  disabled: boolean;
  field: AnyFieldApi;
  htmlFor: "installationsParent" | "versionsParent";
  label: string;
  muted: boolean;
  onBrowse: () => void;
}) {
  return (
    <div className="grid gap-2">
      <FieldLabelTooltip
        className={cn(!field.state.meta.errors.length && muted && "text-muted-foreground")}
        errors={field.state.meta.errors}
        hint="Defaults to the app data directory"
        htmlFor={htmlFor}
      >
        {label}
      </FieldLabelTooltip>
      <div className="flex gap-2">
        <Input
          className={field.state.meta.errors.length ? "text-destructive" : ""}
          disabled={disabled}
          readOnly
          value={muted ? `${appFolder}` : (field.state.value ?? "")}
        />
        <Button disabled={disabled} onClick={onBrowse} variant="outline">
          Browse
        </Button>
      </div>
    </div>
  );
}

function SettingsCheckboxField({
  description,
  field,
  id,
  label,
}: {
  description?: string;
  field: AnyFieldApi;
  id: string;
  label: string;
}) {
  return (
    <div className={description ? "space-y-1" : "flex items-center gap-3"}>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={field.state.value}
          id={id}
          onCheckedChange={(checked) => {
            field.handleChange(checked === true);
          }}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      {description ? <p className="text-muted-foreground pl-7 text-xs">{description}</p> : null}
    </div>
  );
}

function DefaultModSortField({ field }: { field: AnyFieldApi }) {
  return (
    <div className="grid gap-2">
      <Label>Default Mod Sort</Label>
      <Select
        onValueChange={(value) => field.handleChange(value as SortBy)}
        value={field.state.value}
      >
        <SelectTrigger>{sortOptions[field.state.value as SortBy]}</SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {Object.entries(sortOptions).map(([key, value]) => (
            <SelectItem key={key} value={key}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
