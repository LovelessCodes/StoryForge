import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

// ── Types ──

export type HostedServerInstance = {
  id: number;
  name: string;
  version: string;
  port: number;
  bind_ip: string;
  data_dir: string;
  start_params: string;
  favorite: boolean;
  last_played: number | null;
  total_time_played: number;
};

export type ServerRuntimeStatus = {
  status: "not_installed" | "stopped" | "starting" | "running" | "stopping" | "crashed";
  pid: number | null;
  uptime: number | null;
  exit_code: number | null;
};

export type WhitelistEntry = {
  uid: string;
  name: string;
  added_at?: number;
  added_by?: string;
};

export type ServerLogLine = {
  offset: number;
  timestamp: string;
  line: string;
};

export type ServerLogsResponse = {
  lines: ServerLogLine[];
  next_offset: number;
  has_more: boolean;
};

export type CreateInstanceParams = {
  name: string;
  version: string;
  data_dir: string;
  port: number;
  bind_ip: string;
  start_params: string;
  password: string;
  whitelistEnabled: boolean;
  defaultWhitelistUid: string;
  defaultWhitelistName: string;
};

export type UpdateInstancePartial = {
  name?: string;
  version?: string;
  port?: number;
  bind_ip?: string;
  data_dir?: string;
  start_params?: string;
  favorite?: boolean;
  last_played?: number;
  total_time_played?: number;
};

// ── Store ──

type ServerHostingStore = {
  instances: HostedServerInstance[];
  runtimeStatuses: Record<number, ServerRuntimeStatus>;
  loading: boolean;

  loadInstances: () => Promise<void>;
  createInstance: (params: CreateInstanceParams) => Promise<HostedServerInstance>;
  updateInstance: (id: number, partial: UpdateInstancePartial) => Promise<void>;
  deleteInstance: (id: number, deleteData: boolean) => Promise<void>;

  startServer: (id: number) => Promise<void>;
  stopServer: (id: number) => Promise<void>;
  restartServer: (id: number) => Promise<void>;
  sendCommand: (id: number, command: string) => Promise<void>;

  getServerStatus: (id: number) => Promise<ServerRuntimeStatus>;
  getServerLogs: (id: number, offset?: number) => Promise<ServerLogsResponse>;

  readServerConfig: (id: number) => Promise<string>;
  writeServerConfig: (id: number, json: string) => Promise<void>;
  getDefaultServerConfig: (version: string) => Promise<string>;

  checkPortAvailable: (port: number, bindIp: string, excludeId?: number) => Promise<boolean>;

  // Whitelist
  getWhitelist: (id: number) => Promise<WhitelistEntry[]>;
  addToWhitelist: (id: number, uid: string, name: string) => Promise<WhitelistEntry>;
  removeFromWhitelist: (id: number, uid: string) => Promise<void>;
  bulkImportWhitelist: (id: number, entries: WhitelistEntry[]) => Promise<number>;

  // Whitelist mode
  setWhitelistMode: (id: number, enabled: boolean) => Promise<void>;

  // Player lookup
  lookupPlayerUid: (name: string) => Promise<WhitelistEntry | null>;
  lookupPlayerName: (uid: string) => Promise<string | null>;

  updateRuntimeStatus: (id: number, status: ServerRuntimeStatus) => void;
  moveInstance: (id: number, newIndex: number) => void;
  toggleFavorite: (id: number) => void;
};

export const useServerHostingStore = create<ServerHostingStore>((set, get) => ({
  instances: [],
  runtimeStatuses: {},
  loading: false,

  loadInstances: async () => {
    set({ loading: true });
    try {
      const instances = await invoke<HostedServerInstance[]>("get_all_hosted_servers");
      set({ instances, loading: false });

      // Fetch status for all instances in parallel (single batch, no cascade)
      const statuses = await Promise.all(
        instances.map(async (inst) => {
          try {
            const status = await invoke<ServerRuntimeStatus>("get_server_status", {
              instanceId: inst.id,
            });
            return [inst.id, status] as const;
          } catch {
            return [
              inst.id,
              {
                status: "stopped",
                pid: null,
                uptime: null,
                exit_code: null,
              },
            ] as const;
          }
        }),
      );

      const statusMap: Record<number, ServerRuntimeStatus> = {};
      for (const [id, s] of statuses) {
        statusMap[id] = s;
      }
      set((prev) => ({ runtimeStatuses: { ...prev.runtimeStatuses, ...statusMap } }));
    } catch (e) {
      console.error("Failed to load hosted servers:", e);
      set({ loading: false });
    }
  },

  createInstance: async (params) => {
    const instance = await invoke<HostedServerInstance>("create_hosted_server", {
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
    });
    set((s) => ({ instances: [...s.instances, instance] }));
    return instance;
  },

  updateInstance: async (id, partial) => {
    await invoke("update_hosted_server", { instanceId: id, partial });
    // Reload to get fresh state
    await get().loadInstances();
  },

  deleteInstance: async (id, deleteData) => {
    await invoke("delete_hosted_server", { instanceId: id, deleteData: Boolean(deleteData) });
    set((s) => ({
      instances: s.instances.filter((i) => i.id !== id),
    }));
  },

  startServer: async (id) => {
    await invoke("start_hosted_server", { instanceId: id });
    set((s) => ({
      runtimeStatuses: {
        ...s.runtimeStatuses,
        [id]: { status: "starting", pid: null, uptime: null, exit_code: null },
      },
    }));
  },

  stopServer: async (id) => {
    await invoke("stop_hosted_server", { instanceId: id });
    set((s) => ({
      runtimeStatuses: {
        ...s.runtimeStatuses,
        [id]: { status: "stopping", pid: null, uptime: null, exit_code: null },
      },
    }));
  },

  restartServer: async (id) => {
    await invoke("restart_hosted_server", { instanceId: id });
  },

  sendCommand: async (id, command) => {
    await invoke("send_server_command", { instanceId: id, command });
  },

  getServerStatus: async (id) => {
    return await invoke<ServerRuntimeStatus>("get_server_status", {
      instanceId: id,
    });
  },

  getServerLogs: async (id, offset) => {
    return await invoke<ServerLogsResponse>("get_server_logs", {
      instanceId: id,
      offset: offset ?? null,
    });
  },

  readServerConfig: async (id) => {
    return await invoke<string>("read_server_config", { instanceId: id });
  },

  writeServerConfig: async (id, json) => {
    await invoke("write_server_config", {
      instanceId: id,
      jsonContent: json,
    });
  },

  getDefaultServerConfig: async (version) => {
    return await invoke<string>("get_default_server_config", { version });
  },

  checkPortAvailable: async (port, bindIp, excludeId) => {
    return await invoke<boolean>("check_port_available", {
      port,
      bindIp,
      excludeInstanceId: excludeId ?? null,
    });
  },

  getWhitelist: async (id) => {
    return await invoke<WhitelistEntry[]>("get_whitelist", {
      instanceId: id,
    });
  },

  addToWhitelist: async (id, uid, name) => {
    return await invoke<WhitelistEntry>("add_to_whitelist", {
      instanceId: id,
      uid,
      name,
    });
  },

  removeFromWhitelist: async (id, uid) => {
    await invoke("remove_from_whitelist", { instanceId: id, uid });
  },

  bulkImportWhitelist: async (id, entries) => {
    return await invoke<number>("bulk_import_whitelist", {
      instanceId: id,
      entries,
    });
  },

  setWhitelistMode: async (id, enabled) => {
    await invoke("set_whitelist_mode", {
      instanceId: id,
      enabled,
    });
  },

  lookupPlayerUid: async (name) => {
    const result = await invoke<WhitelistEntry | null>("lookup_player_uid", {
      accountName: name,
    });
    return result;
  },

  lookupPlayerName: async (uid) => {
    const result = await invoke<string | null>("lookup_player_name", { uid });
    return result;
  },

  updateRuntimeStatus: (id, status) => {
    set((s) => ({
      runtimeStatuses: {
        ...s.runtimeStatuses,
        [id]: status,
      },
    }));
  },

  moveInstance: (id, newIndex) => {
    set((s) => {
      const instances = [...s.instances];
      const oldIndex = instances.findIndex((i) => i.id === id);
      if (oldIndex === -1) return s;
      const [item] = instances.splice(oldIndex, 1);
      instances.splice(newIndex, 0, item);
      return { instances };
    });
  },

  toggleFavorite: (id) => {
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i)),
    }));
    const inst = get().instances.find((i) => i.id === id);
    if (inst) {
      void get().updateInstance(id, { favorite: !inst.favorite });
    }
  },
}));
