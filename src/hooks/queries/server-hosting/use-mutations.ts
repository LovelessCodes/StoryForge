import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

import type {
  CreateInstanceParams,
  HostedServerInstance,
  ServerRuntimeStatus,
  UpdateInstancePartial,
  WhitelistEntry,
} from "@/lib/server-hosting-types";

import {
  hostedServersQueryKey,
  serverConfigQueryKey,
  serverStatusQueryKey,
  whitelistQueryKey,
} from "./query-keys";

// ── Instance CRUD ──

export const useCreateInstance = (
  props?: UseMutationOptions<HostedServerInstance, Error, CreateInstanceParams>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: (params: CreateInstanceParams) =>
      invoke<HostedServerInstance>("create_hosted_server", {
        name: params.name,
        version: params.version,
        dataDir: params.data_dir,
        port: params.port,
        bindIp: params.bind_ip,
        startParams: params.start_params,
        password: params.password,
        whitelistEnabled: params.whitelistEnabled,
        defaultWhitelistUid: params.defaultWhitelistUid,
        defaultWhitelistName: params.defaultWhitelistName,
      }),
    onSuccess: async (...args) => {
      void queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() });
      props?.onSuccess?.(...args);
    },
  });
};

export const useUpdateInstance = (
  props?: UseMutationOptions<void, Error, { id: number; partial: UpdateInstancePartial }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, partial }: { id: number; partial: UpdateInstancePartial }) =>
      invoke("update_hosted_server", { instanceId: id, partial }) as Promise<void>,
    onSuccess: async (...args) => {
      void queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() });
      props?.onSuccess?.(...args);
    },
  });
};

export const useDeleteInstance = (
  props?: UseMutationOptions<void, Error, { id: number; deleteData: boolean }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, deleteData }: { id: number; deleteData: boolean }) =>
      invoke("delete_hosted_server", {
        instanceId: id,
        deleteData: Boolean(deleteData),
      }) as Promise<void>,
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: hostedServersQueryKey() });
      queryClient.removeQueries({ queryKey: serverStatusQueryKey(id) });
      queryClient.removeQueries({ queryKey: serverConfigQueryKey(id) });
      queryClient.removeQueries({ queryKey: whitelistQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};

// ── Server Control (with optimistic status updates) ──

export const useStartServer = (props?: UseMutationOptions<void, Error, number>) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: (id: number) => invoke("start_hosted_server", { instanceId: id }) as Promise<void>,
    onMutate: async (id: number) => {
      const previous = queryClient.getQueryData<ServerRuntimeStatus>(serverStatusQueryKey(id));
      const optimistic: ServerRuntimeStatus = {
        status: "starting",
        pid: null,
        uptime: null,
        exit_code: null,
      };
      queryClient.setQueryData(serverStatusQueryKey(id), optimistic);
      return { previous };
    },
    onError: (_, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(serverStatusQueryKey(id), context.previous);
      }
      toast.error(`Failed to start server: ${_}`);
    },
  });
};

export const useStopServer = (props?: UseMutationOptions<void, Error, number>) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: (id: number) => invoke("stop_hosted_server", { instanceId: id }) as Promise<void>,
    onMutate: async (id: number) => {
      const previous = queryClient.getQueryData<ServerRuntimeStatus>(serverStatusQueryKey(id));
      const optimistic: ServerRuntimeStatus = {
        status: "stopping",
        pid: null,
        uptime: null,
        exit_code: null,
      };
      queryClient.setQueryData(serverStatusQueryKey(id), optimistic);
      return { previous };
    },
    onError: (_, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(serverStatusQueryKey(id), context.previous);
      }
      toast.error(`Failed to stop server: ${_}`);
    },
  });
};

export const useRestartServer = (props?: UseMutationOptions<void, Error, number>) => {
  return useMutation({
    ...props,
    mutationFn: (id: number) =>
      invoke("restart_hosted_server", { instanceId: id }) as Promise<void>,
    onError: () => {
      toast.error("Failed to restart server");
    },
  });
};

export const useSendCommand = (
  props?: UseMutationOptions<void, Error, { id: number; command: string }>,
) => {
  return useMutation({
    ...props,
    mutationFn: ({ id, command }: { id: number; command: string }) =>
      invoke("send_server_command", { instanceId: id, command }) as Promise<void>,
  });
};

// ── Favorite (optimistic) ──

export const useToggleFavorite = (
  props?: UseMutationOptions<void, Error, { id: number; favorite: boolean }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, favorite }: { id: number; favorite: boolean }) =>
      invoke("update_hosted_server", { instanceId: id, partial: { favorite } }) as Promise<void>,
    onMutate: async ({ id, favorite }) => {
      const previous = queryClient.getQueryData<HostedServerInstance[]>(hostedServersQueryKey());
      queryClient.setQueryData<HostedServerInstance[]>(hostedServersQueryKey(), (old) =>
        old?.map((i) => (i.id === id ? { ...i, favorite } : i)),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(hostedServersQueryKey(), context.previous);
      }
      toast.error("Failed to update favorite");
    },
    onSuccess: (...args) => {
      props?.onSuccess?.(...args);
    },
  });
};

// ── Server Config ──

export const useWriteServerConfig = (
  props?: UseMutationOptions<void, Error, { id: number; json: string }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, json }: { id: number; json: string }) =>
      invoke("write_server_config", { instanceId: id, jsonContent: json }) as Promise<void>,
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: serverConfigQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};

// ── Whitelist ──

export const useAddToWhitelist = (
  props?: UseMutationOptions<WhitelistEntry, Error, { id: number; uid: string; name: string }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, uid, name }: { id: number; uid: string; name: string }) =>
      invoke<WhitelistEntry>("add_to_whitelist", { instanceId: id, uid, name }),
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: whitelistQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};

export const useRemoveFromWhitelist = (
  props?: UseMutationOptions<void, Error, { id: number; uid: string }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, uid }: { id: number; uid: string }) =>
      invoke("remove_from_whitelist", { instanceId: id, uid }) as Promise<void>,
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: whitelistQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};

export const useBulkImportWhitelist = (
  props?: UseMutationOptions<number, Error, { id: number; entries: WhitelistEntry[] }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, entries }: { id: number; entries: WhitelistEntry[] }) =>
      invoke<number>("bulk_import_whitelist", { instanceId: id, entries }),
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: whitelistQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};

export const useSetWhitelistMode = (
  props?: UseMutationOptions<void, Error, { id: number; enabled: boolean }>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...props,
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      invoke("set_whitelist_mode", { instanceId: id, enabled }) as Promise<void>,
    onSuccess: async (...args) => {
      const { id } = args[1];
      void queryClient.invalidateQueries({ queryKey: whitelistQueryKey(id) });
      props?.onSuccess?.(...args);
    },
  });
};
