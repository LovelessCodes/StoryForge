import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";

type ServerStore = {
  servers: Server[];
  loadServers: () => Promise<void>;
  addServer: (server: Server, cb?: (status: boolean) => void) => void;
  removeAllServers: () => void;
  removeServer: (id: number) => void;
  moveServer: (id: number, newIndex: number) => void;
  toggleFavorite: (id: number) => void;
  updateServer: (server: Server, cb?: (status: boolean) => void) => void;
};

export type Server = {
  id: number;
  index: number;
  name: string;
  ip: string;
  port: number | null;
  password: string;
  favorite: boolean;
  installationId: number;
  installationName: string;
};

type SavedServer = {
  id: number;
  name: string;
  ip: string;
  port: number | null;
  password: string;
  installation_id: number;
  installation_name: string;
  favorite: boolean;
};

export const useServerStore = create<ServerStore>()((set) => ({
  addServer: (server, cb) =>
    set((state) => {
      if (state.servers.find((s) => s.name === server.name && s.ip === server.ip)) {
        toast.error(`Server "${server.name}" already exists`);
        cb?.(false);
        return state;
      }
      toast.success(`Server "${server.name}" added successfully`);
      cb?.(true);
      return { ...state, servers: [...state.servers, server] };
    }),
  loadServers: async () => {
    try {
      const raw = await invoke<SavedServer[]>("fetch_all_servers");
      set((state) => {
        // Merge with existing servers to preserve favorites and indexes
        const existingById = new Map(state.servers.map((s) => [s.id, s]));
        const servers: Server[] = raw.map((r, idx) => {
          const existing = existingById.get(r.id);
          return {
            id: r.id,
            index: existing?.index ?? idx,
            name: r.name,
            ip: r.ip,
            port: r.port,
            password: r.password,
            favorite: existing?.favorite ?? r.favorite ?? false,
            installationId: r.installation_id,
            installationName: r.installation_name,
          };
        });
        return { servers };
      });
    } catch (e) {
      console.error("Failed to load servers:", e);
    }
  },
  moveServer: (id, newIndex) =>
    set((state) => {
      const servers = [...state.servers];
      const oldIndex = servers.findIndex((s) => s.id === id);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= servers.length) return state;

      const [moved] = servers.splice(oldIndex, 1);
      servers.splice(newIndex, 0, moved);

      const reindexed = servers.map((server, idx) => ({
        ...server,
        index: idx,
      }));
      return { ...state, servers: reindexed };
    }),
  removeAllServers: () => set((state) => ({ ...state, servers: [] })),
  removeServer: (id) =>
    set((state) => {
      toast.success("Server removed successfully");
      return {
        ...state,
        servers: state.servers.filter((server) => server.id !== id),
      };
    }),
  servers: [],
  toggleFavorite: (id) =>
    set((state) => {
      const server = state.servers.find((s) => s.id === id);
      if (server) {
        invoke("set_server_favorite", { favorite: !server.favorite, id }).catch((e) =>
          console.error("Failed to save server favorite:", e),
        );
      }
      return {
        ...state,
        servers: state.servers.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)),
      };
    }),
  updateServer: (updatedServer, cb) =>
    set((state) => {
      if (!state.servers.find((s) => s.id === updatedServer.id)) {
        toast.error("Server not found");
        cb?.(false);
        return state;
      }
      toast.success("Server updated successfully");
      cb?.(true);
      return {
        ...state,
        servers: state.servers.map((server) =>
          server.id === updatedServer.id ? { ...server, ...updatedServer } : server,
        ),
      };
    }),
}));

export const useServers = () => {
  const { servers, loadServers, ...rest } = useServerStore();
  return {
    servers: servers.toSorted((a, b) => a.index - b.index),
    loadServers,
    ...rest,
  };
};
