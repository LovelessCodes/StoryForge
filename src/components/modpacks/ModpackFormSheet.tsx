import { useQuery } from "@tanstack/react-query";
import { CheckIcon, Loader2, SparklesIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { toast } from "@/lib/notify";

const IMAGE_URL_PREFIX = "https://moddbcdn.vintagestory.at/";

const formSchema = z.object({
  description: z.string(),
  imageUrl: z.string(),
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

type SlugResult = {
  available: boolean;
  suggestion?: string;
  alternatives?: string[];
};

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
  const isEdit = modpack != null;

  const [name, setName] = useState(modpack?.name ?? "");
  const [slug, setSlug] = useState(modpack?.slug ?? "");
  const [description, setDescription] = useState(modpack?.description ?? "");
  const [imageUrl, setImageUrl] = useState(modpack?.imageUrl ?? "");
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

  const parsed = formSchema.safeParse({ description, imageUrl, name, slug });
  const issues = parsed.success ? [] : parsed.error.issues;
  const issueFor = (path: string) =>
    touched[path] ? issues.find((issue) => issue.path[0] === path)?.message : undefined;

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
  const slugUnavailable = !isEdit && slugCheck !== null && !slugCheck.available;
  const canSubmit =
    name.trim().length > 0 && (isEdit || (slugValid && !slugUnavailable)) && !saving;

  const applySuggestion = (suggestion: string) => {
    slugManuallyEdited.current = true;
    setSlug(suggestion);
  };

  async function submit() {
    if (!parsed.success) {
      setTouched({ description: true, imageUrl: true, name: true, slug: true });
      return;
    }
    if (imageUrl.trim().length > 0 && !imageUrl.startsWith(IMAGE_URL_PREFIX)) {
      toast.error("Image URLs must be from moddbcdn.vintagestory.at", {
        description: "Upload your image at https://mods.vintagestory.at/edit/mod first.",
      });
      return;
    }
    if (slugUnavailable) {
      toast.error("That slug is not available", {
        description: "Pick the suggestion or one of the alternatives below the Slug field.",
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
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to ${isEdit ? "update" : "create"} modpack`, { description: message });
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
          <SheetTitle>{isEdit ? "Edit modpack" : "Create modpack"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the modpack details below."
              : "Publish a new collection of mods for other players."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {/* Name */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-name">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                autoFocus
                disabled={saving}
                id="modpack-name"
                placeholder="My Awesome Modpack"
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
              <div className="grid gap-1.5">
                <label className="text-xs font-medium" htmlFor="modpack-slug">
                  Slug <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Input
                    className="pr-8 font-mono"
                    disabled={saving}
                    id="modpack-slug"
                    placeholder="my-awesome-modpack"
                    value={slug}
                    onBlur={() => setTouched((prev) => ({ ...prev, slug: true }))}
                    onChange={(event) => {
                      slugManuallyEdited.current = true;
                      setSlug(event.target.value);
                    }}
                  />
                  {slugChecking && (
                    <Loader2 className="text-muted-foreground absolute top-2 right-2.5 size-3.5 animate-spin" />
                  )}
                  {!slugChecking && slugValid && slugCheck?.available && (
                    <CheckIcon className="text-success absolute top-2 right-2.5 size-3.5" />
                  )}
                </div>
                {issueFor("slug") && (
                  <p className="text-destructive text-[11px]">{issueFor("slug")}</p>
                )}

                {/* Suggestion / alternatives when the slug is taken */}
                {!slugChecking && slugCheck && !slugCheck.available && (
                  <div className="grid gap-1">
                    {slugCheck.suggestion && (
                      <div className="flex items-center gap-1.5">
                        <SparklesIcon className="text-muted-foreground size-3" />
                        <span className="text-muted-foreground text-xs">Suggestion:</span>
                        <button
                          className="text-accent-primary text-xs font-medium hover:underline"
                          type="button"
                          onClick={() => applySuggestion(slugCheck.suggestion!)}
                        >
                          {slugCheck.suggestion}
                        </button>
                      </div>
                    )}
                    {slugCheck.alternatives && slugCheck.alternatives.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground text-xs">Alternatives:</span>
                        {slugCheck.alternatives.map((alternative) => (
                          <button
                            className="bg-muted hover:bg-accent rounded-none px-1.5 py-0.5 text-xs transition-colors"
                            key={alternative}
                            type="button"
                            onClick={() => applySuggestion(alternative)}
                          >
                            {alternative}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-description">
                Description
              </label>
              <Textarea
                disabled={saving}
                id="modpack-description"
                placeholder="A collection of mods for…"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            {/* Image URL */}
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="modpack-image">
                Image URL
              </label>
              <Input
                disabled={saving}
                id="modpack-image"
                placeholder="https://moddbcdn.vintagestory.at/…"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
              <p className="text-muted-foreground text-[11px]">
                Upload your image to{" "}
                <a
                  className="text-accent-primary underline hover:no-underline"
                  href="https://mods.vintagestory.at/edit/mod"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  mods.vintagestory.at
                </a>{" "}
                and paste the link here. External URLs are not accepted.
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
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create modpack"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
