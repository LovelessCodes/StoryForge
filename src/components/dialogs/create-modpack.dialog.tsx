import { useForm } from "@tanstack/react-form";
import { CheckIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rootDialogHandle } from "@/handles";
import type { ModpackItem } from "@/hooks/use-modpacks";
import { authClient } from "@/lib/auth";

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

const modpackFormSchema = z.object({
  description: z.string(),
  imageUrl: z.string(),
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
});

export function CreateModpackDialog({ modpack }: CreateModpackDialogProps) {
  const isEdit = !!modpack;

  // Track whether the user has manually edited the slug
  const slugManuallyEdited = useRef(false);
  const [slugResult, setSlugResult] = useState<SlugResult | null>(null);

  const form = useForm({
    defaultValues: {
      description: modpack?.description ?? "",
      imageUrl: modpack?.imageUrl ?? "",
      name: modpack?.name ?? "",
      slug: modpack?.slug ?? "",
    },
    onSubmit: async ({ value }) => {
      if (!value.name.trim()) {
        toast.error("Name is required");
        return;
      }
      if (!isEdit && !value.slug.trim()) {
        toast.error("Slug is required");
        return;
      }
      if (
        value.imageUrl.trim().length > 0 &&
        !value.imageUrl.startsWith("https://moddbcdn.vintagestory.at/")
      ) {
        toast.error(
          "Image URLs must be from moddbcdn.vintagestory.at. Upload your image at https://mods.vintagestory.at/edit/mod first.",
        );
        return;
      }
      try {
        if (isEdit && modpack) {
          await authClient.updateModpack(
            modpack.slug,
            {
              description: value.description,
              imageUrl: value.imageUrl.length > 0 ? value.imageUrl : undefined,
              name: value.name,
            },
            {
              onSuccess: async () => {
                toast.success(`Modpack "${value.name}" updated`);
                rootDialogHandle.close();
              },
            },
          );
        } else {
          await authClient.createModpack(
            {
              description: value.description,
              imageUrl: value.imageUrl.length > 0 ? value.imageUrl : undefined,
              name: value.name,
              slug: value.slug,
            },
            {
              onSuccess: async () => {
                toast.success(`Modpack "${value.name}" created`);
                rootDialogHandle.close();
              },
            },
          );
        }
      } catch (e) {
        toast.error(`Failed to ${isEdit ? "update" : "create"} modpack: ${(e as Error).message}`);
      }
    },
    validators: {
      onChange: modpackFormSchema,
    },
  });

  const applySuggestion = (s: string) => {
    slugManuallyEdited.current = true;
    form.setFieldValue("slug", s);
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
          <form.Field name="name">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label
                  className={field.state.meta.errors.length ? "text-destructive" : ""}
                  htmlFor="mp-name"
                >
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  autoFocus
                  className={field.state.meta.errors.length ? "text-destructive" : ""}
                  id="mp-name"
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    const value = e.target.value;
                    field.handleChange(value);
                    // Auto-generate slug from name
                    if (!slugManuallyEdited.current && !isEdit) {
                      form.setFieldValue("slug", slugify(value));
                    }
                  }}
                  placeholder="My Awesome Modpack"
                  value={field.state.value}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-destructive text-xs">{field.state.meta.errors[0]?.message}</p>
                )}
              </div>
            )}
          </form.Field>

          {/* Slug — create only */}
          {!isEdit && (
            <form.Field
              name="slug"
              validators={{
                onChangeAsync: async (field) => {
                  if (!field.value) {
                    setSlugResult(null);
                    return;
                  }
                  const result = await authClient.checkModpackSlugAvailability(field.value);
                  setSlugResult(result.data as SlugResult);
                  if (!result.data?.available) {
                    return { message: "Slug is not available" };
                  }
                },
                onChangeAsyncDebounceMs: 500,
              }}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label
                    className={field.state.meta.errors.length ? "text-destructive" : ""}
                    htmlFor="mp-slug"
                  >
                    Slug <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      className={field.state.meta.errors.length ? "text-destructive" : ""}
                      id="mp-slug"
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        slugManuallyEdited.current = true;
                        field.handleChange(e.target.value);
                      }}
                      placeholder="my-awesome-modpack"
                      value={field.state.value}
                    />
                    {field.state.meta.isValidating && (
                      <LoaderCircleIcon className="text-muted-foreground absolute top-2 right-2 size-4 animate-spin" />
                    )}
                    {!field.state.meta.isValidating &&
                      field.state.meta.isValid &&
                      field.state.value.trim().length > 0 && (
                        <CheckIcon className="text-success absolute top-2 right-2 size-4" />
                      )}
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-destructive text-xs">
                      {field.state.meta.errors[0]?.message}
                    </p>
                  )}

                  {/* Suggestion / alternatives */}
                  {!field.state.meta.isValidating && slugResult && !slugResult.available && (
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
            </form.Field>
          )}

          {/* Description */}
          <form.Field name="description">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-desc">Description</Label>
                <Textarea
                  id="mp-desc"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="A collection of mods for..."
                  rows={3}
                  value={field.state.value}
                />
              </div>
            )}
          </form.Field>

          {/* Image URL */}
          <form.Field name="imageUrl">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="mp-image">Image URL</Label>
                <Input
                  id="mp-image"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="https://moddbcdn.vintagestory.at/..."
                  value={field.state.value}
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
            )}
          </form.Field>

          <form.Subscribe
            selector={(s) => ({
              canSubmit: s.canSubmit,
              isSubmitting: s.isSubmitting,
              isTouched: s.isTouched,
            })}
          >
            {(state) => (
              <Button
                className="w-full"
                disabled={state.isSubmitting || !state.canSubmit || !state.isTouched}
                onClick={() => form.handleSubmit()}
              >
                {state.isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create modpack"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </>
  );
}
