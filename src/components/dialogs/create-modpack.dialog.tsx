import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";
import { rootDialogHandle } from "@/routes/__root";

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

export type CreateModpackDialogProps = {
  modpack?: ModpackItem;
};

export function CreateModpackDialog({ modpack }: CreateModpackDialogProps) {
  const isEdit = !!modpack;
  const queryClient = useQueryClient();
  const [name, setName] = useState(modpack?.name ?? "");
  const [slug, setSlug] = useState(modpack?.slug ?? "");
  const [description, setDescription] = useState(modpack?.description ?? "");
  const [imageUrl, setImageUrl] = useState(modpack?.imageUrl ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Track whether the user has manually edited the slug
  const slugManuallyEdited = useRef(false);
  const [slugResult, setSlugResult] = useState<SlugResult | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const checkTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Auto-generate slug from name when user hasn't manually edited slug
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (!slugManuallyEdited.current) {
      setSlug(slugify(value));
    }
  }, []);

  const handleSlugChange = useCallback((value: string) => {
    slugManuallyEdited.current = true;
    setSlug(value);
  }, []);

  // Debounced slug availability check
  useEffect(() => {
    if (!slug.trim() || isEdit) {
      setSlugResult(null);
      setCheckingSlug(false);
      return;
    }

    setCheckingSlug(true);
    setSlugResult(null);

    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    checkTimeout.current = setTimeout(async () => {
      try {
        const result = await authClient.checkModpackSlugAvailability(slug);
        setSlugResult(result.data as SlugResult);
      } catch {
        // Silently ignore — user can still try to create
      } finally {
        setCheckingSlug(false);
      }
    }, 500);

    return () => {
      if (checkTimeout.current !== undefined) clearTimeout(checkTimeout.current);
    };
  }, [slug, isEdit]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!isEdit && !slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    // Image URL policy: must be from moddbcdn.vintagestory.at
    if (imageUrl.trim() && !imageUrl.startsWith("https://moddbcdn.vintagestory.at/")) {
      toast.error(
        "Image URLs must be from moddbcdn.vintagestory.at. Upload your image at https://mods.vintagestory.at/edit/mod first.",
      );
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && modpack) {
        await authClient.updateModpack(
          modpack.slug,
          {
            description,
            imageUrl,
            name,
          },
          {
            onSuccess: async () => {
              toast.success(`Modpack "${name}" updated`);
              await queryClient.invalidateQueries({ queryKey: ["modpacks"] });
              rootDialogHandle.close();
            },
          },
        );
      } else {
        await authClient.createModpack(
          {
            description,
            imageUrl,
            name,
            slug,
          },
          {
            onSuccess: async () => {
              toast.success(`Modpack "${name}" created`);
              await queryClient.invalidateQueries({ queryKey: ["modpacks"] });
              rootDialogHandle.close();
            },
          },
        );
      }
    } catch (e) {
      toast.error(`Failed to ${isEdit ? "update" : "create"} modpack: ${e as Error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const applySuggestion = (s: string) => {
    slugManuallyEdited.current = true;
    setSlug(s);
  };

  return (
    <>
      <DialogClose />
      <div className="flex flex-col gap-4 px-1">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit modpack" : "Create modpack"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the modpack details below."
              : "Fill in the details for your new modpack."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              autoFocus
              id="mp-name"
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Awesome Modpack"
              value={name}
            />
          </div>

          {/* Slug — create only */}
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mp-slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="mp-slug"
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="my-awesome-modpack"
                  value={slug}
                />
                {checkingSlug && (
                  <LoaderCircleIcon className="text-muted-foreground absolute top-2 right-2 size-4 animate-spin" />
                )}
                {!checkingSlug && slugResult?.available && slug.trim() && (
                  <CheckIcon className="text-success absolute top-2 right-2 size-4" />
                )}
              </div>

              {/* Suggestion / alternatives */}
              {!checkingSlug && slugResult && !slugResult.available && (
                <div className="flex flex-col gap-1">
                  {slugResult.suggestion && (
                    <div className="flex items-center gap-1.5">
                      <SparklesIcon className="text-muted-foreground size-3" />
                      <span className="text-muted-foreground text-xs">Suggestion:</span>
                      <button
                        className="text-primary text-xs font-medium hover:underline"
                        onClick={() => applySuggestion(slugResult.suggestion!)}
                        type="button"
                      >
                        {slugResult.suggestion}
                      </button>
                    </div>
                  )}
                  {slugResult.alternatives && slugResult.alternatives.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-muted-foreground text-xs">Alternatives:</span>
                      {slugResult.alternatives.map((alt) => (
                        <button
                          className="bg-muted hover:bg-accent rounded px-1.5 py-0.5 text-xs transition-colors"
                          key={alt}
                          onClick={() => applySuggestion(alt)}
                          type="button"
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-desc">Description</Label>
            <Textarea
              id="mp-desc"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of mods for..."
              rows={3}
              value={description}
            />
          </div>

          {/* Image URL */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-image">Image URL</Label>
            <Input
              id="mp-image"
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://moddbcdn.vintagestory.at/..."
              value={imageUrl}
            />
            <p className="text-muted-foreground text-xs">
              Upload your image to{" "}
              <a
                className="text-primary underline hover:no-underline"
                href="https://mods.vintagestory.at/edit/mod"
                rel="noopener noreferrer"
                target="_blank"
              >
                mods.vintagestory.at
              </a>{" "}
              and paste the link here. External URLs are not accepted.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={submitting || !name.trim() || (!isEdit && !slug.trim())}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Create modpack"}
          </Button>
        </div>
      </div>
    </>
  );
}
