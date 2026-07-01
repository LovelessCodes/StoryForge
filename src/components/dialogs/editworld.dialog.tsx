import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useUpdateWorld } from "@/hooks/use-update-world";
import type { World } from "@/lib/types";
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
          .find((inst) => inst.path.split("/").pop() === world.installation_name)
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
                      <p className="text-xs">Enter world name</p>
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
          <form.Field name="installationId">
            {(field) => (
              <div className="grid gap-2">
                <TooltipTrigger
                  render={
                    <Label
                      className={clsx([
                        field.state.meta.errors.length ? "text-destructive" : "",
                        "w-fit",
                      ])}
                      htmlFor="installationId"
                    />
                  }
                  handle={rootTooltipHandle}
                  payload={() => (
                    <>
                      <p className="text-xs">Pick game installation</p>
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
                  Installation
                  <span className="text-destructive">*</span>
                </TooltipTrigger>
                <Select onValueChange={(v) => v && field.handleChange(v)} value={field.state.value}>
                  <SelectTrigger className="flex w-full gap-1 truncate">
                    {installations.find((inst) => inst.id.toString() === field.state.value)
                      ? `${installations.find((inst) => inst.id.toString() === field.state.value)?.name} (${installations.find((inst) => inst.id.toString() === field.state.value)?.version})`
                      : "Game installation"}
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {installations
                      ?.sort((a, b) => a.index - b.index)
                      .map((installation) => (
                        <SelectItem key={installation.id} value={installation.id.toString()}>
                          {installation.name} ({installation.version})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>
        <Button className="w-full" onClick={() => form.handleSubmit()} type="button">
          Update World
        </Button>
      </div>
    </>
  );
}
