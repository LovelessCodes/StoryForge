import { createTauriStore } from "@tauri-store/zustand";
import { toast } from "sonner";
import { create } from "zustand";

type ServerStore = {
	servers: Server[];
	addServer: (server: Server, cb?: (status: boolean) => void) => void;
	removeAllServers: () => void;
	removeAllServersExcept: (id: number) => void;
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
};

export const useServerStore = create<ServerStore>()((set) => ({
	addServer: (server, cb) =>
		set((state) => {
			if (state.servers.find((s) => s.name === server.name)) {
				toast.error(`Server with name "${server.name}" already exists`);
				cb?.(false);
				return state;
			}
			if (state.servers.find((s) => s.ip === server.ip)) {
				toast.error(`Server with IP "${server.ip}" already exists`);
				cb?.(false);
				return state;
			}
			toast.success(`Server "${server.name}" added successfully`);
			cb?.(true);
			return { ...state, servers: [...state.servers, server] };
		}),
	moveServer: (id, newIndex) =>
		set((state) => {
			const servers = [...state.servers];
			const oldIndex = servers.findIndex((s) => s.id === id);
			if (oldIndex === -1 || newIndex < 0 || newIndex >= servers.length)
				return state;

			const [moved] = servers.splice(oldIndex, 1);
			servers.splice(newIndex, 0, moved);

			// Re-index all servers
			const reindexed = servers.map((server, idx) => ({
				...server,
				index: idx,
			}));
			return { ...state, servers: reindexed };
		}),
	removeAllServers: () => set((state) => ({ ...state, servers: [] })),
	removeAllServersExcept: (id) =>
		set((state) => ({
			...state,
			servers: state.servers.filter((server) => server.id === id),
		})),
	removeServer: (id) =>
		set((state) => {
			toast.success(`Server removed successfully`);
			return {
				...state,
				servers: state.servers.filter((server) => server.id !== id),
			};
		}),
	servers: [],
	toggleFavorite: (id) =>
		set((state) => ({
			...state,
			servers: state.servers.map((server) =>
				server.id === id ? { ...server, favorite: !server.favorite } : server,
			),
		})),
	updateServer: (updatedServer, cb) =>
		set((state) => {
			if (!state.servers.find((s) => s.id === updatedServer.id)) {
				toast.error(`Server not found`);
				cb?.(false);
				return state;
			}
			if (
				state.servers.find(
					(s) => s.name === updatedServer.name && s.id !== updatedServer.id,
				)
			) {
				toast.error(`Server with name "${updatedServer.name}" already exists`);
				cb?.(false);
				return state;
			}
			if (
				state.servers.find(
					(s) => s.ip === updatedServer.ip && s.id !== updatedServer.id,
				)
			) {
				toast.error(`Server with IP "${updatedServer.ip}" already exists`);
				cb?.(false);
				return state;
			}
			toast.success(`Server updated successfully`);
			cb?.(true);
			return {
				...state,
				servers: state.servers.map((server) =>
					server.id === updatedServer.id
						? { ...server, ...updatedServer }
						: server,
				),
			};
		}),
}));

export const tauriServersHandler = createTauriStore("servers", useServerStore, {
	saveOnChange: true,
});
