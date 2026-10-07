import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

type ServerStore = {
  servers: Server[];
  loadServers: () => Promise<void>;
  addServer: (server: Server, cb?: (status: boolean) => void) => void;
  removeAllServers: () => void;
  removeServer: (rowKey: string) => void;
  moveServer: (rowKey: string, newIndex: number) => void;
  toggleFavorite: (rowKey: string) => void;
  updateServer: (server: Server, cb?: (status: boolean) => void) => void;
};

export type Server = {
  /** Address-scoped id (favorites are stored against it). */
  id: number;
  /**
   * Row identity: the same server can exist in several profiles, so store
   * operations and React keys use the profile-scoped row key.
   */
  rowKey: string;
  index: number;
  name: string;
  ip: string;
  port: number | null;
  password: string;
  favorite: boolean;
  profileId: number;
  profileName: string;
};

type SavedServer = {
  id: number;
  row_key: string;
  name: string;
  ip: string;
  port: number | null;
  password: string;
  profile_id: number;
  profile_name: string;
  favorite: boolean;
};

export const useServerStore = create<ServerStore>()((set) => ({
  addServer: (server, cb) =>
    set((state) => {
      // The same server may legitimately exist in several profiles; only a
      // duplicate within the same profile is rejected.
      if (
        state.servers.find(
          (s) => s.name === server.name && s.ip === server.ip && s.profileId === server.profileId,
        )
      ) {
        toast.error(t("servers.store.duplicate", { name: server.name }));
        cb?.(false);
        return state;
      }
      cb?.(true);
      return { ...state, servers: [...state.servers, server] };
    }),
  loadServers: async () => {
    try {
      const raw = await invoke<SavedServer[]>("fetch_all_servers");
      set((state) => {
        // Merge with existing servers to preserve row indexes; favorites come
        // from Rust, which owns server_favorites.json.
        const existingByRowKey = new Map(state.servers.map((s) => [s.rowKey, s]));
        const servers: Server[] = raw.map((r, idx) => {
          const existing = existingByRowKey.get(r.row_key);
          return {
            id: r.id,
            rowKey: r.row_key,
            index: existing?.index ?? idx,
            name: r.name,
            ip: r.ip,
            port: r.port,
            password: r.password,
            favorite: r.favorite ?? false,
            profileId: r.profile_id,
            profileName: r.profile_name,
          };
        });
        return { servers };
      });
    } catch (e) {
      console.error("Failed to load servers:", e);
    }
  },
  moveServer: (rowKey, newIndex) =>
    set((state) => {
      const servers = [...state.servers];
      const oldIndex = servers.findIndex((s) => s.rowKey === rowKey);
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
  removeServer: (rowKey) =>
    set((state) => {
      return {
        ...state,
        servers: state.servers.filter((server) => server.rowKey !== rowKey),
      };
    }),
  servers: [],
  toggleFavorite: (rowKey) =>
    set((state) => {
      const server = state.servers.find((s) => s.rowKey === rowKey);
      if (server) {
        const nextFavorite = !server.favorite;
        // Favorites are address-scoped, so Rust gets the server id; the
        // optimistic update only touches the clicked row.
        invoke("set_server_favorite", { favorite: nextFavorite, id: server.id }).catch((e) => {
          console.error("Failed to save server favorite:", e);
          toast.error(t("servers.store.favoriteFailed"));
          // Roll the optimistic flip back; server_favorites.json is authoritative.
          set((state) => ({
            servers: state.servers.map((s) =>
              s.rowKey === rowKey && s.favorite === nextFavorite
                ? { ...s, favorite: !nextFavorite }
                : s,
            ),
          }));
        });
      }
      return {
        ...state,
        servers: state.servers.map((s) =>
          s.rowKey === rowKey ? { ...s, favorite: !s.favorite } : s,
        ),
      };
    }),
  updateServer: (updatedServer, cb) =>
    set((state) => {
      if (!state.servers.find((s) => s.rowKey === updatedServer.rowKey)) {
        toast.error(t("servers.store.notFound"));
        cb?.(false);
        return state;
      }
      cb?.(true);
      return {
        ...state,
        servers: state.servers.map((server) =>
          server.rowKey === updatedServer.rowKey ? { ...server, ...updatedServer } : server,
        ),
      };
    }),
}));
