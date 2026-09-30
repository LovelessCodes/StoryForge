import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { FieldLabelTooltip } from "@/components/inputs/field-label.tooltip";
import { FormTextField } from "@/components/inputs/form-text.field";
import { InstallationSelect } from "@/components/pickers/installation.picker";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rootDialogHandle } from "@/handles";
import { useUpdateWorld } from "@/hooks/use-update-world";
import type { World } from "@/lib/types";
import { pathBasename } from "@/lib/utils";
import { useInstallations } from "@/stores/installations";

export type EditWorldDialogProps = {
  world: World;
};

const worldSchema = z.object({
  installationId: z.string().refine((val) => /^\d+$/.test(val), {
    message: "You must select an installation",
  }),
  name: z.string().min(2).max(100),
});

export function EditWorldDialog({ world }: EditWorldDialogProps) {
  const { installations } = useInstallations();
  const queryClient = useQueryClient();
  const { mutateAsync: updateWorld } = useUpdateWorld({
    onError: (error) => {
      toast.error(`Error updating world: ${error.message}`);
    },
    onSuccess: async () => {
      toast.success(`World ${world.data.world_name} updated successfully`);
      void queryClient.invalidateQueries({ queryKey: ["saves"] });
      rootDialogHandle.close();
    },
  });
  const form = useForm({
    defaultValues: {
      installationId:
        installations
          .find((inst) => pathBasename(inst.path) === world.installation_name)
          ?.id.toString() || "",
      name: world.data.world_name || "",
    },
    onSubmit: async ({ value }) => {
      await updateWorld({
        identifier: world.data.savegame_identifier,
        installationId: parseInt(value.installationId, 10),
        name: value.name,
        worldPath: world.path,
      });
    },
    validators: {
      onChange: worldSchema,
    },
  });
  return (
    <>
      <DialogClose />
      <div className="flex flex-col items-center gap-2">
        <DialogHeader>
          <DialogTitle className="sm:text-center">Edit World</DialogTitle>
          <DialogDescription className="sm:text-center">
            Enter the world's details.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="space-y-5">
        <div className="space-y-4">
          <form.Field name="name">
            {(field) => (
              <FormTextField
                field={field}
                hint="Enter world name"
                htmlFor="name"
                label="Name"
                onEnter={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void form.handleSubmit();
                  }
                }}
                required
              />
            )}
          </form.Field>
          <form.Field name="installationId">
            {(field) => (
              <div className="grid gap-2">
                <FieldLabelTooltip
                  errors={field.state.meta.errors}
                  hint="Pick game installation"
                  htmlFor="installationId"
                >
                  Installation
                  <span className="text-destructive">*</span>
                </FieldLabelTooltip>
                <InstallationSelect
                  installations={installations}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
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
          Update World
        </Button>
      </div>
    </>
  );
}
