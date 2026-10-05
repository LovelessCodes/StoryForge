import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth";
import { toast } from "@/lib/notify";
import type { Profile } from "@/stores/profiles";

const SemVer = z
  .string()
  .min(1, "modpacks.versionForm.errors.versionRequired")
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
    "modpacks.versionForm.errors.invalidSemver",
  );

const versionSchema = z.object({
  gameVersion: SemVer,
  modConfigsUrl: z.string(),
  modsString: z.string(),
  version: SemVer,
});

export type ExistingVersion = {
  version: string;
  gameVersion: string;
  modsString: string;
  modConfigsUrl: string;
};

interface ModpackVersionFormProps {
  modpackSlug: string;
  /** Existing version to edit; omit to create a new one. */
  existingVersion?: ExistingVersion;
  profiles: Profile[];
  onCancel: () => void;
  onSuccess: () => void;
}

/** Inline create/edit form for a single modpack version. */
export default function ModpackVersionForm({
  modpackSlug,
  existingVersion,
  profiles,
  onCancel,
  onSuccess,
}: ModpackVersionFormProps) {
  const { t } = useTranslation();
  const isNew = existingVersion == null;

  const [version, setVersion] = useState(existingVersion?.version ?? "");
  const [gameVersion, setGameVersion] = useState(existingVersion?.gameVersion ?? "");
  const [modsString, setModsString] = useState(existingVersion?.modsString ?? "");
  const [modConfigsUrl, setModConfigsUrl] = useState(existingVersion?.modConfigsUrl ?? "");
  const [pickedProfileId, setPickedProfileId] = useState<number | null>(null);
  const [uploadModConfig, setUploadModConfig] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const parsed = versionSchema.safeParse({ gameVersion, modConfigsUrl, modsString, version });
  const issues = parsed.success ? [] : parsed.error.issues;
  const issueFor = (path: string) => {
    const message = touched[path]
      ? issues.find((issue) => issue.path[0] === path)?.message
      : undefined;
    return message ? t(message) : undefined;
  };

  const canSubmit = version.trim().length > 0 && gameVersion.trim().length > 0 && !saving;

  async function handlePickProfile(profile: Profile) {
    setPickedProfileId(profile.id);
    setGameVersion(profile.version);
    try {
      const result = (await invoke("get_mods", { path: profile.path })) as {
        mods: { modid: string; version: string }[];
      };
      setModsString(result.mods.map((mod) => `${mod.modid}@${mod.version}`).join(","));
    } catch {
      toast.error(t("modpacks.versionForm.readModsFailed"));
    }
  }

  async function submit() {
    if (!parsed.success) {
      setTouched({ gameVersion: true, modConfigsUrl: true, modsString: true, version: true });
      return;
    }

    setSaving(true);
    try {
      let configUrl = parsed.data.modConfigsUrl;

      // Upload the picked profile's ModConfig folder if requested.
      if (uploadModConfig && pickedProfileId !== null) {
        const profile = profiles.find((entry) => entry.id === pickedProfileId);
        if (profile) {
          const zipBytes = await invoke<number[]>("zip_modconfig", { profilePath: profile.path });
          const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
          const data = new FormData();
          data.append("version", parsed.data.version);
          data.append("modConfig", blob, "ModConfig.zip");
          try {
            const upload = await authClient.uploadModpackVersionConfig(modpackSlug, data);
            if (upload.data?.url) {
              configUrl = upload.data.url;
            }
          } catch {
            toast.error(t("modpacks.versionForm.uploadConfigFailed"));
          }
        }
      }

      if (isNew) {
        await authClient.createModpackVersion(modpackSlug, {
          gameVersion: parsed.data.gameVersion,
          modConfigsUrl: configUrl,
          modsString: parsed.data.modsString,
          modpack: modpackSlug,
          version: parsed.data.version,
        });
      } else {
        await authClient.updateModpackVersion(modpackSlug, parsed.data.version, {
          gameVersion: parsed.data.gameVersion,
          modConfigsUrl: configUrl,
          modsString: parsed.data.modsString,
        });
      }
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("modpacks.versionForm.saveFailed"), { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-muted/30 grid gap-3 border p-3">
      <span className="text-xs font-semibold">
        {isNew
          ? t("modpacks.versionForm.newTitle")
          : t("modpacks.versionForm.editTitle", { version })}
      </span>

      {/* Pick from profile — new versions only */}
      {isNew && profiles.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-muted-foreground text-[11px] font-medium">
            {t("modpacks.versionForm.pickFromProfile")}
          </span>
          <Select
            items={profiles.map((profile) => ({
              label: `${profile.name} (VS ${profile.version})`,
              value: profile.id.toString(),
            }))}
            value={pickedProfileId === null ? null : pickedProfileId.toString()}
            onValueChange={(value) => {
              if (value == null) return;
              const profile = profiles.find((entry) => entry.id.toString() === value);
              if (profile) void handlePickProfile(profile);
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("modpacks.versionForm.pickFromProfile")}
            >
              <SelectValue placeholder={t("modpacks.versionForm.selectProfile")} />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id.toString()}>
                  {profile.name}{" "}
                  <span className="text-muted-foreground">(VS {profile.version})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className="text-muted-foreground text-[11px] font-medium" htmlFor="mpv-version">
            {t("common.fields.version")} <span className="text-destructive">*</span>
          </label>
          <Input
            className="font-mono"
            disabled={!isNew || saving}
            id="mpv-version"
            placeholder="1.0.0"
            value={version}
            onBlur={() => setTouched((prev) => ({ ...prev, version: true }))}
            onChange={(event) => setVersion(event.target.value)}
          />
          {issueFor("version") && (
            <p className="text-destructive text-[11px]">{issueFor("version")}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <label
            className="text-muted-foreground text-[11px] font-medium"
            htmlFor="mpv-game-version"
          >
            {t("modpacks.versionForm.gameVersion")} <span className="text-destructive">*</span>
          </label>
          <Input
            className="font-mono"
            disabled={saving}
            id="mpv-game-version"
            placeholder="1.20.4"
            value={gameVersion}
            onBlur={() => setTouched((prev) => ({ ...prev, gameVersion: true }))}
            onChange={(event) => setGameVersion(event.target.value)}
          />
          {issueFor("gameVersion") && (
            <p className="text-destructive text-[11px]">{issueFor("gameVersion")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="text-muted-foreground text-[11px] font-medium" htmlFor="mpv-mods">
          {t("modpacks.versionForm.modsString")}
        </label>
        <Textarea
          className="min-h-16 resize-none font-mono text-[11px]"
          disabled={saving}
          id="mpv-mods"
          placeholder="modid@version,modid@version,…"
          rows={3}
          value={modsString}
          onChange={(event) => setModsString(event.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <label
          className="text-muted-foreground text-[11px] font-medium"
          htmlFor="mpv-modconfig-url"
        >
          {t("modpacks.versionForm.modConfigsUrl")}
        </label>
        <Input
          disabled={saving}
          id="mpv-modconfig-url"
          placeholder="https://…"
          value={modConfigsUrl}
          onChange={(event) => setModConfigsUrl(event.target.value)}
        />
      </div>

      {/* ModConfig upload — only when a profile was picked */}
      {pickedProfileId !== null && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs">{t("modpacks.versionForm.uploadModConfig")}</span>
          <Switch
            checked={uploadModConfig}
            disabled={saving}
            onCheckedChange={(checked) => setUploadModConfig(checked)}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button disabled={saving} size="sm" variant="ghost" onClick={onCancel}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          disabled={!canSubmit}
          size="sm"
          variant="accent-primary"
          onClick={() => void submit()}
        >
          {saving
            ? t("modpacks.versionForm.saving")
            : isNew
              ? t("common.actions.create")
              : t("common.actions.save")}
        </Button>
      </div>
    </div>
  );
}
