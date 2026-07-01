import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { PasswordInput } from "@/components/inputs/password.input";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootDialogHandle, rootTooltipHandle } from "@/handles";
import { useAddServerToInstallation } from "@/hooks/use-add-server-to-installation";
import { type Installation, useInstallations } from "@/stores/installations";
import { type Server, useServerStore } from "@/stores/servers";

type SniffResult = {
  server_game_version: string | null;
  server_network_version: string | null;
  password_protected: boolean;
  password_valid: boolean | null;
  whitelisted: boolean;
  banned: boolean;
  server_full: boolean;
  auth_required: boolean;
  login_token: string | null;
  disconnect_message: string | null;
};

export const serverSchema = z.object({
  favorite: z.boolean(),
  id: z.number(),
  index: z.number(),
  installationId: z.string().refine((val) => /^\d+$/.test(val), {
    message: "You must select an installation",
  }),
  ip: z.string().min(1),
  name: z.string().min(1),
  password: z.string(),
  port: z
    .string()
    .max(5)
    .nullable()
    .refine((val) => (val ? /^\d+$/.test(val) : true), {
      message: "Port must be a number",
    }),
});

export type ServerDialogProps = {
  /** Pass an existing server to edit, or omit to add a new one. */
  server?: Server;
  /** Pre-select an installation (add mode only). */
  installation?: Installation;
};

export function ServerDialog({ server, installation }: ServerDialogProps) {
  const id = useId();
  const { installations } = useInstallations();
  const { addServer, updateServer, loadServers } = useServerStore();
  const { mutateAsync: addServerToInstallation } = useAddServerToInstallation();
  const [sniffResult, setSniffResult] = useState<SniffResult | null>(null);

  const isEdit = server != null;

  const { mutate: testServer, isPending: isTesting } = useMutation({
    mutationFn: async () => {
      const ip = form.getFieldValue("ip");
      const portStr = form.getFieldValue("port");
      const password = form.getFieldValue("password");
      return invoke<SniffResult>("sniff_server", {
        host: ip,
        password: password || undefined,
        port: portStr ? Number.parseInt(portStr, 10) : undefined,
      });
    },
    onError: (error) => {
      toast.error(`Failed to test server: ${error.message}`);
      setSniffResult(null);
    },
    onSuccess: (data) => {
      setSniffResult(data);
    },
  });

  const form = useForm({
    defaultValues: isEdit
      ? {
          favorite: server.favorite,
          id: server.id,
          index: server.index,
          installationId: server.installationId.toString(),
          ip: server.ip,
          name: server.name,
          password: server.password,
          port: server.port?.toString() ?? null,
        }
      : {
          favorite: false,
          id: Date.now(),
          index: Date.now(),
          installationId: installation?.id.toString() ?? "0",
          ip: "",
          name: "",
          password: "",
          port: "42420",
        },
    onSubmit: async ({ value }) => {
      if (isEdit) {
        // Remove old entry from clientsettings.json, add new one
        await invoke("remove_server_from_installation", {
          installationId: server.installationId,
          server: `${server.name},${server.ip}${server.port ? `:${server.port}` : ""},${server.password ? `${server.password}` : ""}`,
        });
        await invoke("add_server_to_installation", {
          installationId: Number.parseInt(value.installationId, 10),
          server: `${value.name},${value.ip}${value.port ? `:${value.port}` : ""},${value.password ? `${value.password}` : ""}`,
        });
        updateServer(
          {
            favorite: value.favorite,
            id: value.id,
            index: value.index,
            installationId: Number.parseInt(value.installationId, 10),
            installationName:
              installations.find((inst) => inst.id.toString() === value.installationId)?.name ?? "",
            ip: value.ip,
            name: value.name,
            password: value.password,
            port: value.port?.length ? Number.parseInt(value.port, 10) : null,
          },
          async (status) => {
            if (status) {
              await loadServers();
              rootDialogHandle.close();
            }
          },
        );
      } else {
        await addServerToInstallation(
          {
            installationId: Number.parseInt(value.installationId, 10),
            server: `${value.name},${value.ip}${value.port ? `:${value.port}` : ""},${value.password ? `${value.password}` : ""}`,
          },
          {
            onError: (error) => {
              toast.error(`Failed to add server: ${error}`, {
                id: `add-server-${value.name}-${value.ip}`,
              });
            },
            onSuccess: () => {
              addServer(
                {
                  favorite: value.favorite,
                  id: Date.now(),
                  index: Date.now(),
                  installationId: Number.parseInt(value.installationId, 10),
                  installationName:
                    installations.find((inst) => inst.id.toString() === value.installationId)
                      ?.name ?? "",
                  ip: value.ip,
                  name: value.name,
                  password: value.password,
                  port: value.port?.length ? Number.parseInt(value.port, 10) : null,
                },
                async (status) => {
                  if (status) {
                    await loadServers();
                    rootDialogHandle.close();
                  }
                },
              );
            },
          },
        );
      }
    },
    validators: {
      onChange: serverSchema,
    },
  });

  const submitLabel = form.state.isSubmitting
    ? isEdit
      ? "Updating..."
      : "Adding..."
    : isEdit
      ? "Update Server"
      : "Add Server";

  return (
    <>
      <DialogClose />

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
                      <p className="text-xs">Enter server name</p>
                      {field.state.meta.errors.length > 0 &&
                        field.state.meta.errors.map((error) => (
                          <p className="text-destructive text-xs" key={error?.message}>
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
          <form.Field name="password">
            {(field) => (
              <div className="grid gap-2">
                <div className="flex items-center">
                  <TooltipTrigger
                    render={
                      <Label
                        className={clsx([
                          field.state.meta.errors.length ? "text-destructive" : "",
                          "w-fit",
                        ])}
                        htmlFor="password"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Enter password</p>
                        {field.state.meta.errors.length > 0 &&
                          field.state.meta.errors.map((error) => (
                            <p className="text-destructive text-xs" key={error?.message}>
                              {error?.message}
                            </p>
                          ))}
                      </>
                    )}
                  >
                    Password
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </TooltipTrigger>
                </div>
                <PasswordInput
                  id={`${id}-password`}
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
          <div className="grid grid-cols-2 gap-2">
            <form.Field name="ip">
              {(field) => (
                <div className="grid w-full gap-2">
                  <TooltipTrigger
                    render={
                      <Label
                        className={clsx([
                          field.state.meta.errors.length ? "text-destructive" : "",
                          "w-fit",
                        ])}
                        htmlFor="ip"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Enter server IP address</p>
                        {field.state.meta.errors.length > 0 &&
                          field.state.meta.errors.map((error) => (
                            <p className="text-destructive text-xs" key={error?.message}>
                              {error?.message}
                            </p>
                          ))}
                      </>
                    )}
                  >
                    IP Address
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
            <form.Field name="port">
              {(field) => (
                <div className="grid w-full gap-2">
                  <TooltipTrigger
                    render={
                      <Label
                        className={clsx([
                          field.state.meta.errors.length ? "text-destructive" : "",
                          "w-fit",
                        ])}
                        htmlFor="port"
                      />
                    }
                    handle={rootTooltipHandle}
                    payload={() => (
                      <>
                        <p className="text-xs">Enter server port</p>
                        {field.state.meta.errors.length > 0 &&
                          field.state.meta.errors.map((error) => (
                            <p className="text-destructive text-xs" key={error?.message}>
                              {error?.message}
                            </p>
                          ))}
                      </>
                    )}
                  >
                    Port
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
                    value={field.state.value ?? ""}
                  />
                </div>
              )}
            </form.Field>
          </div>
          <form.Field
            name="installationId"
            validators={{
              onSubmit: ({ value }) => {
                if (!installations.find((inst) => inst.id.toString() === value)) {
                  return Error("You must select an installation");
                }
              },
            }}
          >
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
                        field.state.meta.errors.map((error) => (
                          <p className="text-destructive text-xs" key={error?.message}>
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
                      .map((inst) => (
                        <SelectItem key={inst.id} value={inst.id.toString()}>
                          {inst.name} ({inst.version})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={isTesting}
            onClick={() => testServer()}
            type="button"
            variant="outline"
          >
            {isTesting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Testing…
              </>
            ) : (
              "Test Server"
            )}
          </Button>
          <Button className="flex-1" onClick={() => form.handleSubmit()} type="button">
            {submitLabel}
          </Button>
        </div>
        {sniffResult && (
          <div className="bg-muted space-y-1 rounded border p-3 text-xs">
            {sniffResult.server_game_version && (
              <p>
                <span className="text-muted-foreground">Version:</span>{" "}
                <span className="font-mono">v{sniffResult.server_game_version}</span>
                {(() => {
                  const instId = form.getFieldValue("installationId");
                  const inst = installations.find((i) => i.id.toString() === instId);
                  if (inst && sniffResult.server_game_version) {
                    const [instMajor, instMinor] = inst.version.split(".");
                    const [resultMajor, resultMinor] = sniffResult.server_game_version.split(".");
                    const match = instMajor === resultMajor && instMinor === resultMinor;
                    return (
                      <span className={match ? "text-success ml-1" : "text-destructive ml-1"}>
                        {match ? "✓ matches your installation" : "✗ differs from your installation"}
                      </span>
                    );
                  }
                  return null;
                })()}
              </p>
            )}
            {sniffResult.password_protected && (
              <p>
                <span className="text-muted-foreground">Password:</span>{" "}
                {sniffResult.password_valid === true ? (
                  <span className="text-success">Correct</span>
                ) : sniffResult.password_valid === false ? (
                  <span className="text-destructive">Incorrect</span>
                ) : (
                  <span className="text-warning-foreground">Required (enter password to test)</span>
                )}
              </p>
            )}
            {sniffResult.whitelisted && (
              <p className="text-warning-foreground">Server is whitelisted</p>
            )}
            {sniffResult.server_full && <p className="text-destructive">Server is full</p>}
            {sniffResult.banned && <p className="text-destructive">You are banned</p>}
            {sniffResult.disconnect_message && (
              <p className="text-muted-foreground truncate">{sniffResult.disconnect_message}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
