import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";

import type {
  HostedServerInstance,
  ServerRuntimeStatus,
  WhitelistEntry,
} from "@/lib/server-hosting-types";

import {
  hostedServersQueryKey,
  playerLookupByNameQueryKey,
  playerLookupByUidQueryKey,
  serverConfigQueryKey,
  serverStatusQueryKey,
  whitelistQueryKey,
} from "./query-keys";

export const useHostedServers = () => {
  return useQuery({
    queryFn: () => invoke<HostedServerInstance[]>("get_all_hosted_servers"),
    queryKey: hostedServersQueryKey(),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
};

export const useHostedServer = (id: number) => {
  const { data: instances } = useHostedServers();
  return useMemo(() => instances?.find((i) => i.id === id), [instances, id]);
};

export const useServerStatus = (id: number) => {
  return useQuery<ServerRuntimeStatus>({
    queryKey: serverStatusQueryKey(id),
    queryFn: () => {
      const defaultStatus: ServerRuntimeStatus = {
        status: "stopped",
        pid: null,
        uptime: null,
        exit_code: null,
      };
      return defaultStatus;
    },
    staleTime: Infinity,
    initialData: {
      status: "stopped",
      pid: null,
      uptime: null,
      exit_code: null,
    },
  });
};

export const usePlayerLookupByUid = (uid: string) => {
  return useQuery({
    queryFn: () => invoke<string | null>("lookup_player_name", { uid }),
    queryKey: playerLookupByUidQueryKey(uid),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    enabled: uid.length > 0,
  });
};

export const usePlayerLookupByName = (name: string) => {
  return useQuery({
    queryFn: () => invoke<WhitelistEntry | null>("lookup_player_uid", { accountName: name }),
    queryKey: playerLookupByNameQueryKey(name),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    enabled: name.length > 0,
  });
};

export const useServerConfig = (id: number) => {
  return useQuery({
    queryFn: () => invoke<string>("read_server_config", { instanceId: id }),
    queryKey: serverConfigQueryKey(id),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    enabled: !Number.isNaN(id),
  });
};

export const useWhitelist = (id: number) => {
  return useQuery({
    queryFn: async () => {
      const [entries, configJson] = await Promise.all([
        invoke<WhitelistEntry[]>("get_whitelist", { instanceId: id }),
        invoke<string>("read_server_config", { instanceId: id }),
      ]);
      let whitelistEnabled = true;
      try {
        const config = JSON.parse(configJson);
        whitelistEnabled = config.WhitelistMode !== 1;
      } catch {
        // config not valid JSON — leave default
      }
      return { entries, whitelistEnabled };
    },
    queryKey: whitelistQueryKey(id),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    enabled: !Number.isNaN(id),
  });
};
