import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand/react";

import { makeStringFolderSafe, pathDelimiter } from "@/lib/utils";

/**
 * Find an installation by id first, then fall back to name match.
 * Needed because installation ids changed during migration (Date.now() → hash).
 */
export function findInstallationForServer(
  installations: Installation[],
  installationId: number,
  installationName?: string,
): Installation | undefined {
  return (
    installations.find((inst) => inst.id === installationId) ??
    (installationName ? installations.find((inst) => inst.name === installationName) : undefined)
  );
}

export type Installation = {
  id: number;
  name: string;
  index: number;
  path: string;
  lastTimePlayed: number;
  totalTimePlayed: number;
  version: string;
  startParams: string;
  icon: string | null;
  favorite: boolean;
  sizeBytes: number;
  sizeDisplay: string;
  modpackSlug: string | null;
  modpackVersion: string | null;
  environmentVariables?: Record<string, string>;
};

type InstallationResult = {
  id: number;
  name: string;
  version: string;
  startParams: string;
  path: string;
  size_bytes: number;
  size_display: string;
  favorite: boolean;
  icon: string | null;
  last_played: number | null;
  total_time_played: number;
  modpack_slug: string | null;
  modpack_version: string | null;
  env_vars: Record<string, string>;
};

type InstallationsStore = {
  selectedInstallation: Installation | null;
  setSelectedInstallation: (installation: InstallationsStore["selectedInstallation"]) => void;
  installations: Installation[];
  loadInstallations: () => Promise<void>;
  addInstallation: (installation: Installation, cb?: (status: boolean) => void) => void;
  removeInstallation: (id: number) => void;
  updateLastPlayed: (id: number) => void;
  updatePlaytime: (id: number, totalTimePlayed: number, lastTimePlayed: number) => void;
  updateInstallation: (installation: Installation, cb?: (status: boolean) => void) => void;
  moveInstallation: (id: number, newIndex: number) => void;
  toggleFavorite: (id: number) => void;
  updateParent: (newPath: string) => void;
  removeAll: () => void;
};

export const useInstallationsStore = create<InstallationsStore>((set) => ({
  addInstallation: (installation, cb) =>
    set((state) => {
      if (state.installations.find((s) => s.path === installation.path)) {
        toast.error(`Installation with path "${installation.path}" already exists`);
        cb?.(false);
        return state;
      }
      if (state.installations.find((s) => s.id === installation.id)) {
        toast.error(`Installation with ID "${installation.id}" already exists`);
        cb?.(false);
        return state;
      }
      if (state.installations.find((s) => s.name === installation.name)) {
        toast.error(`Installation with name "${installation.name}" already exists`);
        cb?.(false);
        return state;
      }
      const installations = [...state.installations, installation];
      toast.success(`Installation "${installation.name}" added successfully`);
      cb?.(true);
      return { installations };
    }),
  installations: [],
  loadInstallations: async () => {
    try {
      const results = await invoke<InstallationResult[]>("get_all_installations");
      set((state) => {
        // Merge with existing installations to preserve UI-only fields, matching by path
        const existingByPath = new Map(state.installations.map((i) => [i.path, i]));
        const installations: Installation[] = results.map((r, idx) => {
          const existing = existingByPath.get(r.path);
          // Prefer persisted values (from installation.json), fall back to in-memory state
          const persistedLastPlayed = r.last_played ?? existing?.lastTimePlayed ?? 0;
          const persistedTotalPlayed = r.total_time_played ?? existing?.totalTimePlayed ?? 0;
          return {
            id: r.id,
            name: r.name,
            index: existing?.index ?? idx,
            path: r.path,
            lastTimePlayed: Math.max(existing?.lastTimePlayed ?? 0, persistedLastPlayed),
            totalTimePlayed: Math.max(existing?.totalTimePlayed ?? 0, persistedTotalPlayed),
            version: r.version,
            startParams: r.startParams ?? "",
            icon: r.icon ?? existing?.icon ?? null,
            favorite: existing?.favorite ?? r.favorite ?? false,
            sizeBytes: r.size_bytes,
            sizeDisplay: r.size_display,
            modpackSlug: r.modpack_slug ?? existing?.modpackSlug ?? null,
            modpackVersion: r.modpack_version ?? existing?.modpackVersion ?? null,
            environmentVariables: r.env_vars ?? existing?.environmentVariables ?? {},
          };
        });
        return { installations };
      });
    } catch (e) {
      console.error("Failed to load installations:", e);
    }
  },
  moveInstallation: (id, newIndex) =>
    set((state) => {
      const installations = [...state.installations];
      const oldIndex = installations.findIndex((s) => s.id === id);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= installations.length) return state;

      const [moved] = installations.splice(oldIndex, 1);
      installations.splice(newIndex, 0, moved);

      // Re-index all installations
      const reindexed = installations.map((installation, idx) => ({
        ...installation,
        index: idx,
      }));
      return { ...state, installations: reindexed };
    }),
  removeAll: () => set({ installations: [], selectedInstallation: null }),
  removeInstallation: (id) =>
    set((state) => ({
      installations: state.installations.filter((inst) => inst.id !== id),
    })),
  selectedInstallation: null,
  setSelectedInstallation: (installation) => set({ selectedInstallation: installation }),
  toggleFavorite: (id) =>
    set((state) => {
      const inst = state.installations.find((i) => i.id === id);
      if (inst) {
        const newFavorite = !inst.favorite;
        // Persist to installation.json
        invoke("save_installation", {
          envVars: null,
          favorite: newFavorite,
          icon: inst.icon,
          name: inst.name,
          path: inst.path,
          startParams: inst.startParams,
          version: inst.version,
        }).catch((e) => console.error("Failed to save favorite:", e));
        return {
          installations: state.installations.map((i) =>
            i.id === id ? { ...i, favorite: newFavorite } : i,
          ),
        };
      }
      return state;
    }),
  updateInstallation: (installation, cb) =>
    set((state) => {
      if (
        state.installations.find((s) => s.path === installation.path && s.id !== installation.id)
      ) {
        toast.error(`Installation with path "${installation.path}" already exists`);
        cb?.(false);
        return state;
      }
      if (
        state.installations.find((s) => s.name === installation.name && s.id !== installation.id)
      ) {
        toast.error(`Installation with name "${installation.name}" already exists`);
        cb?.(false);
        return state;
      }
      toast.success(`Installation "${installation.name}" updated successfully`);
      cb?.(true);
      return {
        installations: [
          ...state.installations.filter((s) => s.id !== installation.id),
          installation,
        ],
      };
    }),
  updateLastPlayed: (id) =>
    set((state) => ({
      installations: state.installations.map((inst) =>
        inst.id === id ? { ...inst, lastTimePlayed: Date.now() } : inst,
      ),
    })),
  updatePlaytime: (id, totalTimePlayed, lastTimePlayed) =>
    set((state) => ({
      installations: state.installations.map((inst) =>
        inst.id === id ? { ...inst, totalTimePlayed, lastTimePlayed } : inst,
      ),
    })),
  updateParent: (newPath: string) =>
    set((state) => ({
      installations: state.installations.map((inst) => ({
        ...inst,
        path: `${newPath}${newPath.endsWith(pathDelimiter) ? "" : pathDelimiter}installations${pathDelimiter}${makeStringFolderSafe(inst.name)}`,
      })),
    })),
}));

export const useInstallations = () => {
  const {
    loadInstallations,
    updateInstallation,
    addInstallation,
    removeInstallation,
    installations,
    moveInstallation,
    selectedInstallation,
    setSelectedInstallation,
    toggleFavorite,
    updateLastPlayed,
    updatePlaytime,
    updateParent,
    removeAll,
  } = useInstallationsStore();

  const outInstallations = [...installations]
    .filter((i) => i !== null)
    .sort((a, b) => a.index - b.index);

  return {
    addInstallation,
    installations: outInstallations,
    loadInstallations,
    moveInstallation,
    removeAll,
    removeInstallation,
    selectedInstallation,
    setSelectedInstallation,
    toggleFavorite,
    updateInstallation,
    updateLastPlayed,
    updatePlaytime,
    updateParent,
  };
};
