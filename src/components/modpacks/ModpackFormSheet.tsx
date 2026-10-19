import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { toast } from "@/lib/notify";

import ModpackSlugField, { type SlugResult } from "./ModpackSlugField";

const IMAGE_URL_PREFIX = "https://moddbcdn.vintagestory.at/";

const formSchema = z.object({
  description: z.string(),
  imageUrl: z.string(),
  name: z.string().min(1, "modpacks.form.errors.nameRequired"),
  slug: z
    .string()
    .min(1, "modpacks.form.errors.slugRequired")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "modpacks.form.errors.slugFormat"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/** Initial field values; the parent remounts the sheet on every open. */
function formDefaults(modpack: ModpackItem | null) {
  return {
    description: modpack?.description ?? "",
    imageUrl: modpack?.imageUrl ?? "",
    name: modpack?.name ?? "",
    slug: modpack?.slug ?? "",
  };
}

type ModpackFormValues = z.infer<typeof formSchema>;

/** Zod issues for the current values; empty while every field parses. */
function formIssues(values: ModpackFormValues) {
  const parsed = formSchema.safeParse(values);
  return parsed.success ? [] : parsed.error.issues;
}

/** A create-mode slug the API has reported as taken (edits keep their slug). */
function isSlugUnavailable(isEdit: boolean, slugCheck: SlugResult | null): boolean {
  return !isEdit && slugCheck !== null && !slugCheck.available;
}

interface ModpackFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the close animation finishes (the parent clears its state). */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Existing modpack to edit; omit to create a new one. */
  modpack?: ModpackItem | null;
}

/**
 * Create/edit modpack form with slug generation and availability checking.
 *
 * The parent remounts this component (via `key`) on every open, so state is
 * initialized straight from props — no reset effect needed.
 */
export default function ModpackFormSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  modpack = null,
}: ModpackFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = modpack != null;

  const defaults = formDefaults(modpack);
  const [name, setName] = useState(defaults.name);
  const [slug, setSlug] = useState(defaults.slug);
  const [description, setDescription] = useState(defaults.description);
  const [imageUrl, setImageUrl] = useState(defaults.imageUrl);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const slugManuallyEdited = useRef(false);

  // Debounced slug availability check (create only).
  const [debouncedSlug, setDebouncedSlug] = useState(slug);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(slug.trim()), 500);
    return () => clearTimeout(timer);
  }, [slug]);

  const { data: slugCheck = null, isFetching: slugChecking } = useQuery({
    queryKey: ["modpack-slug-availability", debouncedSlug],
    queryFn: async () => {
      const result = await authClient.checkModpackSlugAvailability(debouncedSlug);
      return (result.data as SlugResult | null) ?? null;
    },
    enabled: open && !isEdit && debouncedSlug.length > 0,
    retry: false,
  });

  const issues = formIssues({ description, imageUrl, name, slug });
  const issueFor = (path: string) => {
    const message = touched[path]
      ? issues.find((issue) => issue.path[0] === path)?.message
      : undefined;
    return message ? t(message) : undefined;
  };

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
  const slugUnavailable = isSlugUnavailable(isEdit, slugCheck);
  const canSubmit =
    name.trim().length > 0 && (isEdit || (slugValid && !slugUnavailable)) && !saving;

  const applySuggestion = (suggestion: string) => {
    slugManuallyEdited.current = true;
    setSlug(suggestion);
  };

  async function submit() {
    if (issues.length > 0) {
      setTouched({ description: true, imageUrl: true, name: true, slug: true });
      return;
    }
    if (imageUrl.trim().length > 0 && !imageUrl.startsWith(IMAGE_URL_PREFIX)) {
      toast.error(t("modpacks.form.imageHostError"), {
        description: t("modpacks.form.imageHostHint"),
      });
      return;
    }
    if (slugUnavailable) {
      toast.error(t("modpacks.form.slugUnavailable"), {
        description: t("modpacks.form.slugUnavailableHint"),
      });
      return;
    }

    setSaving(true);
    try {
      if (isEdit && modpack) {
        await authClient.updateModpack(modpack.slug, {
          description,
          imageUrl: imageUrl.length > 0 ? imageUrl : undefined,
          name,
        });
      } else {
        await authClient.createModpack({
          description,
          imageUrl: imageUrl.length > 0 ? imageUrl : undefined,
          name,
          slug,
        });
      }
      onOpenChange(false);
    } catch (error) {
      const message = errorMessage(error);
      toast.error(isEdit ? t("modpacks.form.updateFailed") : t("modpacks.form.createFailed"), {
        description: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>
            {isEdit ? t("modpacks.form.editTitle") : t("modpacks.form.createTitle")}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? t("modpacks.form.editDescription") : t("modpacks.form.createDescription")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {/* Name */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-name">
                {t("common.fields.name")} <span className="text-destructive">*</span>
              </label>
              <Input
                autoFocus
                disabled={saving}
                id="modpack-name"
                placeholder={t("modpacks.form.namePlaceholder")}
                value={name}
                onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  // Auto-generate the slug from the name until the slug is edited by hand.
                  if (!isEdit && !slugManuallyEdited.current) setSlug(slugify(value));
                }}
              />
              {issueFor("name") && (
                <p className="text-destructive text-[11px]">{issueFor("name")}</p>
              )}
            </div>

            {/* Slug — create only */}
            {!isEdit && (
              <ModpackSlugField
                error={issueFor("slug")}
                saving={saving}
                slug={slug}
                slugCheck={slugCheck}
                slugChecking={slugChecking}
                slugValid={slugValid}
                onApplySuggestion={applySuggestion}
                onBlur={() => setTouched((prev) => ({ ...prev, slug: true }))}
                onChange={(value) => {
                  slugManuallyEdited.current = true;
                  setSlug(value);
                }}
              />
            )}

            {/* Description */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-description">
                {t("common.fields.description")}
              </label>
              <Textarea
                disabled={saving}
                id="modpack-description"
                placeholder={t("modpacks.form.descriptionPlaceholder")}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {/* Image URL */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-image">
                {t("modpacks.form.imageUrl")}
              </label>
              <Input
                disabled={saving}
                id="modpack-image"
                placeholder="https://moddbcdn.vintagestory.at/…"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
              <p className="text-muted-foreground text-[11px]">
                <Trans
                  i18nKey="modpacks.form.imageHint"
                  components={{
                    site: (
                      <a
                        className="text-accent-primary underline hover:no-underline"
                        href="https://mods.vintagestory.at/edit/mod"
                        rel="noopener noreferrer"
                        target="_blank"
                      />
                    ),
                  }}
                />
              </p>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            className="w-full"
            disabled={!canSubmit}
            variant="accent-primary"
            onClick={() => void submit()}
          >
            {saving
              ? t("modpacks.form.saving")
              : isEdit
                ? t("modpacks.form.saveChanges")
                : t("modpacks.form.createSubmit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
