import { useForm } from "@tanstack/react-form";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Installation } from "@/stores/installations";

const SemVer = z
  .string()
  .min(1, "Version is required")
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    "Invalid semantic version",
  );

const modpackVersionSchema = z.object({
  gameVersion: SemVer,
  modConfigsUrl: z.string(),
  modsString: z.string(),
  version: SemVer,
});

export type CreateModpackVersionDialogProps = {
  modpackSlug: string;
  existingVersion?: {
    version: string;
    gameVersion: string;
    modsString: string;
    modConfigsUrl: string;
  };
  installations: Installation[];
  onSuccess: () => void;
  onCancel: () => void;
};

export function CreateModpackVersionDialog({
  modpackSlug,
  existingVersion,
  installations,
  onSuccess,
  onCancel,
}: CreateModpackVersionDialogProps) {
  const isNew = !existingVersion;
  const [pickedInstallationId, setPickedInstallationId] = useState<number | null>(null);
  const [uploadModConfig, setUploadModConfig] = useState(false);

  const form = useForm({
    defaultValues: {
      gameVersion: existingVersion?.gameVersion ?? "",
      modConfigsUrl: existingVersion?.modConfigsUrl ?? "",
      modsString: existingVersion?.modsString ?? "",
      version: existingVersion?.version ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        let configUrl = value.modConfigsUrl;

        // Upload ModConfig zip if requested
        if (uploadModConfig && pickedInstallationId) {
          const inst = installations.find((i) => i.id === pickedInstallationId);
          if (inst) {
            const zipBytes = await invoke<number[]>("zip_modconfig", {
              installationPath: inst.path,
            });
            const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
            const data = new FormData();
            data.append("version", value.version);
            data.append("modConfig", blob, "ModConfig.zip");
            try {
              const upload = await authClient.uploadModpackVersionConfig(modpackSlug, data);
              if (upload?.data?.url) {
                configUrl = upload.data.url;
                toast.success("ModConfig uploaded");
              }
            } catch {
              toast.error("Failed to upload ModConfig");
            }
          }
        }

        if (isNew) {
          await authClient.createModpackVersion(
            modpackSlug,
            {
              gameVersion: value.gameVersion,
              modConfigsUrl: configUrl,
              modsString: value.modsString,
              modpack: modpackSlug,
              version: value.version,
            },
            {
              onSuccess: () => {
                toast.success(`Version ${value.version} created`);
                onSuccess();
              },
            },
          );
        } else {
          await authClient.updateModpackVersion(
            modpackSlug,
            value.version,
            {
              gameVersion: value.gameVersion,
              modConfigsUrl: configUrl,
              modsString: value.modsString,
            },
            {
              onSuccess: () => {
                toast.success(`Version ${value.version} updated`);
                onSuccess();
              },
            },
          );
        }
      } catch (e) {
        toast.error(`Failed to save version: ${(e as Error).message}`);
      }
    },
    validators: {
      onChange: modpackVersionSchema,
    },
  });

  const handlePickInstallation = async (inst: Installation) => {
    setPickedInstallationId(inst.id);
    form.setFieldValue("gameVersion", inst.version);
    try {
      const result = (await invoke("get_mods", { path: inst.path })) as {
        mods: { modid: string; version: string }[];
      };
      const modsString = result.mods.map((m) => `${m.modid}@${m.version}`).join(",");
      form.setFieldValue("modsString", modsString);
    } catch {
      toast.error("Failed to read installed mods");
    }
  };

  return (
    <div className="bg-muted/50 flex flex-col gap-3 border px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="text-sm font-semibold">
          {isNew ? "New version" : `Edit v${form.state.values.version}`}
        </span>
      </div>

      {/* Pick from installation — new versions only */}
      {isNew && installations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-muted-foreground text-xs">Pick from installation</Label>
          <Select
            onValueChange={(v) => {
              const inst = installations.find((i) => i.id === Number(v));
              if (inst) void handlePickInstallation(inst);
            }}
            value={pickedInstallationId?.toString() ?? ""}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select an installation…" />
              {pickedInstallationId
                ? (installations.find((i) => i.id === pickedInstallationId)?.name ?? "Selected")
                : null}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {installations.map((inst) => (
                <SelectItem key={inst.id} value={inst.id.toString()}>
                  {inst.name}{" "}
                  <span className="text-muted-foreground text-xs">(VS {inst.version})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="version">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label
                className={cn(
                  "text-xs",
                  field.state.meta.errors.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Version <span className="text-destructive">*</span>
              </Label>
              <Input
                className="h-8 text-sm"
                disabled={!isNew}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="1.0.0"
                value={field.state.value}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-xs">{field.state.meta.errors[0]?.message}</p>
              )}
            </div>
          )}
        </form.Field>
        <form.Field name="gameVersion">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label
                className={cn(
                  "text-xs",
                  field.state.meta.errors.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                Game version <span className="text-destructive">*</span>
              </Label>
              <Input
                className="h-8 text-sm"
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="1.20.4"
                value={field.state.value}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-xs">{field.state.meta.errors[0]?.message}</p>
              )}
            </div>
          )}
        </form.Field>
      </div>
      <form.Field name="modsString">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">Mods string</Label>
            <Textarea
              className="font-mono text-xs"
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="modid@version,modid@version,..."
              rows={3}
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>
      <form.Field name="modConfigsUrl">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">Mod configs URL</Label>
            <Input
              className="h-8 text-sm"
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="https://..."
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      {/* Upload ModConfig checkbox — when picking from installation */}
      {pickedInstallationId && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={uploadModConfig}
            id="uploadModConfig"
            onCheckedChange={(checked) => setUploadModConfig(checked === true)}
          />
          <Label className="text-xs" htmlFor="uploadModConfig">
            Upload ModConfig folder from installation
          </Label>
        </div>
      )}

      <form.Subscribe
        selector={(s) => ({
          canSubmit: s.canSubmit,
          isSubmitting: s.isSubmitting,
        })}
      >
        {(state) => (
          <div className="flex items-center justify-end gap-2">
            <Button disabled={state.isSubmitting} onClick={onCancel} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={state.isSubmitting || !state.canSubmit}
              onClick={() => form.handleSubmit()}
              size="sm"
            >
              {state.isSubmitting ? "Saving…" : isNew ? "Create" : "Save"}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </div>
  );
}
