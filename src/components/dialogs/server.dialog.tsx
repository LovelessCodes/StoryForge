import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Loader2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FieldLabelTooltip } from "@/components/inputs/field-label.tooltip";
import { FormTextField } from "@/components/inputs/form-text.field";
import { PasswordInput } from "@/components/inputs/password.input";
import { InstallationSelect } from "@/components/pickers/installation.picker";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { rootDialogHandle } from "@/handles";
import { useAddServerToInstallation } from "@/hooks/use-add-server-to-installation";
import type { AnyReactFormApi } from "@/lib/form";
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

const serverSchema = z.object({
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

/** True when both versions share major and minor parts ("1.21.3" vs "1.21.0"). */
function sameMinorVersion(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const [aMajor, aMinor] = a.split(".");
  const [bMajor, bMinor] = b.split(".");
  return aMajor === bMajor && aMinor === bMinor;
}

export function ServerDialog({ server, installation }: ServerDialogProps) {
  const id = useId();
  const { installations } = useInstallations();
  const addServer = useServerStore((s) => s.addServer);
  const updateServer = useServerStore((s) => s.updateServer);
  const loadServers = useServerStore((s) => s.loadServers);
  const { mutateAsync: addServerToInstallation } = useAddServerToInstallation();
  const [sniffResult, setSniffResult] = useState<SniffResult | null>(null);

  const isEdit = server != null;

  // sniff_server only fills the local Test-result state; nothing is cached
  // react-doctor-disable-next-line query-mutation-missing-invalidation
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
        <ServerFormFields form={form} id={id} installations={installations} />
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
          <Button
            className="flex-1"
            disabled={form.state.isSubmitting}
            onClick={() => form.handleSubmit()}
            type="button"
          >
            {submitLabel}
          </Button>
        </div>
        {sniffResult && (
          <SniffResultPanel
            installationId={form.getFieldValue("installationId")}
            installations={installations}
            result={sniffResult}
          />
        )}
      </div>
    </>
  );
}

/** Name, password, address, port and installation fields of the server form. */
function ServerFormFields({
  form,
  id,
  installations,
}: {
  form: AnyReactFormApi;
  id: string;
  installations: Installation[];
}) {
  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void form.handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <form.Field name="name">
        {(field) => (
          <FormTextField
            field={field}
            hint="Enter server name"
            htmlFor="name"
            label="Name"
            onEnter={submitOnEnter}
            required
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="grid gap-2">
            <div className="flex items-center">
              <FieldLabelTooltip
                errors={field.state.meta.errors}
                hint="Enter password"
                htmlFor="password"
              >
                Password
                <span className="text-muted-foreground text-xs">(optional)</span>
              </FieldLabelTooltip>
            </div>
            <PasswordInput
              id={`${id}-password`}
              onChange={(e) => field.handleChange(e.target.value)}
              onKeyUp={submitOnEnter}
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-2">
        <form.Field name="ip">
          {(field) => (
            <FormTextField
              className="grid w-full gap-2"
              field={field}
              hint="Enter server IP address"
              htmlFor="ip"
              label="IP Address"
              onEnter={submitOnEnter}
              required
            />
          )}
        </form.Field>
        <form.Field name="port">
          {(field) => (
            <FormTextField
              className="grid w-full gap-2"
              field={field}
              hint="Enter server port"
              htmlFor="port"
              label="Port"
              onEnter={submitOnEnter}
              required
            />
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
  );
}

/** Result of the Test Server probe. */
function SniffResultPanel({
  installationId,
  installations,
  result,
}: {
  installationId: string;
  installations: Installation[];
  result: SniffResult;
}) {
  const installation = installations.find((i) => i.id.toString() === installationId);
  const versionMatches = sameMinorVersion(
    installation?.version,
    result.server_game_version ?? undefined,
  );

  return (
    <div className="bg-muted space-y-1 rounded border p-3 text-xs">
      {result.server_game_version && (
        <p>
          <span className="text-muted-foreground">Version:</span>{" "}
          <span className="font-mono">v{result.server_game_version}</span>
          {installation && (
            <span className={versionMatches ? "text-success ml-1" : "text-destructive ml-1"}>
              {versionMatches ? "✓ matches your installation" : "✗ differs from your installation"}
            </span>
          )}
        </p>
      )}
      {result.password_protected && (
        <p>
          <span className="text-muted-foreground">Password:</span>{" "}
          {result.password_valid === true ? (
            <span className="text-success">Correct</span>
          ) : result.password_valid === false ? (
            <span className="text-destructive">Incorrect</span>
          ) : (
            <span className="text-warning-foreground">Required (enter password to test)</span>
          )}
        </p>
      )}
      {result.whitelisted && <p className="text-warning-foreground">Server is whitelisted</p>}
      {result.server_full && <p className="text-destructive">Server is full</p>}
      {result.banned && <p className="text-destructive">You are banned</p>}
      {result.disconnect_message && (
        <p className="text-muted-foreground truncate">{result.disconnect_message}</p>
      )}
    </div>
  );
}
