import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { create } from "zustand/react";

import { errorMessage } from "@/lib/errors";
import { makeStringFolderSafe, pathDelimiter } from "@/lib/helpers";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

/**
 * Find an profile by id first, then fall back to name match.
 * Needed because profile ids changed during migration (Date.now() → hash).
 */
export function findProfileForServer(
  profiles: Profile[],
  profileId: number,
  profileName?: string,
): Profile | undefined {
  return (
    profiles.find((inst) => inst.id === profileId) ??
    (profileName ? profiles.find((inst) => inst.name === profileName) : undefined)
  );
}

export type Profile = {
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
  /** Linked to a game data folder outside the profiles root. */
  external: boolean;
  /** Create a backup before the game launches. */
  backupOnPlay: boolean;
  /** Keep at most this many backups (0 keeps them all). */
  backupLimit: number;
  /** Skip the shared game defaults when this profile launches. */
  ignoreGameDefaults: boolean;
};

type ProfileResult = {
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
  external?: boolean;
  backup_on_play?: boolean;
  backup_limit?: number;
  ignore_game_defaults?: boolean;
};

type ProfilesStore = {
  selectedProfile: Profile | null;
  setSelectedProfile: (profile: ProfilesStore["selectedProfile"]) => void;
  profiles: Profile[];
  loadProfiles: () => Promise<void>;
  addProfile: (profile: Profile, cb?: (status: boolean) => void) => void;
  removeProfile: (id: number) => void;
  updateLastPlayed: (id: number) => void;
  updatePlaytime: (id: number, totalTimePlayed: number, lastTimePlayed: number) => void;
  updateProfile: (profile: Profile, cb?: (status: boolean) => void) => void;
  moveProfile: (id: number, newIndex: number) => void;
  toggleFavorite: (id: number) => void;
  updateParent: (newPath: string) => void;
  removeAll: () => void;
};

export const useProfilesStore = create<ProfilesStore>((set) => ({
  addProfile: (profile, cb) =>
    set((state) => {
      if (state.profiles.find((s) => s.path === profile.path)) {
        toast.error(t("profiles.store.pathExists", { path: profile.path }));
        cb?.(false);
        return state;
      }
      if (state.profiles.find((s) => s.id === profile.id)) {
        toast.error(t("profiles.store.idExists", { id: profile.id }));
        cb?.(false);
        return state;
      }
      if (state.profiles.find((s) => s.name === profile.name)) {
        toast.error(t("profiles.store.nameExists", { name: profile.name }));
        cb?.(false);
        return state;
      }
      const profiles = [...state.profiles, profile];
      cb?.(true);
      return { profiles };
    }),
  profiles: [],
  loadProfiles: async () => {
    try {
      const results = await invoke<ProfileResult[]>("get_all_profiles");
      set((state) => {
        // Merge with existing profiles to preserve UI-only fields, matching by path
        const existingByPath = new Map(state.profiles.map((i) => [i.path, i]));
        const profiles: Profile[] = results.map((r, idx) => {
          const existing = existingByPath.get(r.path);
          // Prefer persisted values (from profile.json), fall back to in-memory state
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
            external: r.external ?? existing?.external ?? false,
            backupOnPlay: r.backup_on_play ?? existing?.backupOnPlay ?? false,
            backupLimit: r.backup_limit ?? existing?.backupLimit ?? 5,
            ignoreGameDefaults: r.ignore_game_defaults ?? existing?.ignoreGameDefaults ?? false,
          };
        });
        return { profiles };
      });
    } catch (e) {
      console.error("Failed to load profiles:", e);
    }
  },
  moveProfile: (id, newIndex) =>
    set((state) => {
      const profiles = [...state.profiles];
      const oldIndex = profiles.findIndex((s) => s.id === id);
      if (oldIndex === -1 || newIndex < 0 || newIndex >= profiles.length) return state;

      const [moved] = profiles.splice(oldIndex, 1);
      profiles.splice(newIndex, 0, moved);

      // Re-index all profiles
      const reindexed = profiles.map((profile, idx) => ({
        ...profile,
        index: idx,
      }));
      return { ...state, profiles: reindexed };
    }),
  removeAll: () => set({ profiles: [], selectedProfile: null }),
  removeProfile: (id) =>
    set((state) => ({
      profiles: state.profiles.filter((inst) => inst.id !== id),
    })),
  selectedProfile: null,
  setSelectedProfile: (profile) => set({ selectedProfile: profile }),
  toggleFavorite: (id) =>
    set((state) => {
      const inst = state.profiles.find((i) => i.id === id);
      if (inst) {
        const newFavorite = !inst.favorite;
        // Persist to profile.json
        invoke("save_profile", {
          envVars: null,
          favorite: newFavorite,
          icon: inst.icon,
          name: inst.name,
          path: inst.path,
          startParams: inst.startParams,
          version: inst.version,
        }).catch((e) => {
          console.error("Failed to save favorite:", e);
          toast.error(t("profiles.dialog.saveFailed"), { description: errorMessage(e) });
          // Roll the optimistic flip back; profile.json is authoritative.
          set((state) => ({
            profiles: state.profiles.map((i) =>
              i.id === id && i.favorite === newFavorite ? { ...i, favorite: !newFavorite } : i,
            ),
          }));
        });
        return {
          profiles: state.profiles.map((i) => (i.id === id ? { ...i, favorite: newFavorite } : i)),
        };
      }
      return state;
    }),
  updateProfile: (profile, cb) =>
    set((state) => {
      if (state.profiles.find((s) => s.path === profile.path && s.id !== profile.id)) {
        toast.error(t("profiles.store.pathExists", { path: profile.path }));
        cb?.(false);
        return state;
      }
      if (state.profiles.find((s) => s.name === profile.name && s.id !== profile.id)) {
        toast.error(t("profiles.store.nameExists", { name: profile.name }));
        cb?.(false);
        return state;
      }
      cb?.(true);
      return {
        profiles: [...state.profiles.filter((s) => s.id !== profile.id), profile],
      };
    }),
  updateLastPlayed: (id) =>
    set((state) => ({
      profiles: state.profiles.map((inst) =>
        inst.id === id ? { ...inst, lastTimePlayed: Date.now() } : inst,
      ),
    })),
  updatePlaytime: (id, totalTimePlayed, lastTimePlayed) =>
    set((state) => ({
      profiles: state.profiles.map((inst) =>
        inst.id === id ? { ...inst, totalTimePlayed, lastTimePlayed } : inst,
      ),
    })),
  updateParent: (newPath: string) =>
    set((state) => ({
      profiles: state.profiles.map((inst) => ({
        ...inst,
        path: `${newPath}${newPath.endsWith(pathDelimiter) ? "" : pathDelimiter}profiles${pathDelimiter}${makeStringFolderSafe(inst.name)}`,
      })),
    })),
}));

export const useProfiles = () => {
  // Field selectors instead of the whole store: with `useProfilesStore()`
  // every consumer re-rendered on any state change.
  const profiles = useProfilesStore((s) => s.profiles);
  const selectedProfile = useProfilesStore((s) => s.selectedProfile);
  const addProfile = useProfilesStore((s) => s.addProfile);
  const loadProfiles = useProfilesStore((s) => s.loadProfiles);
  const moveProfile = useProfilesStore((s) => s.moveProfile);
  const removeAll = useProfilesStore((s) => s.removeAll);
  const removeProfile = useProfilesStore((s) => s.removeProfile);
  const setSelectedProfile = useProfilesStore((s) => s.setSelectedProfile);
  const toggleFavorite = useProfilesStore((s) => s.toggleFavorite);
  const updateProfile = useProfilesStore((s) => s.updateProfile);
  const updateLastPlayed = useProfilesStore((s) => s.updateLastPlayed);
  const updateParent = useProfilesStore((s) => s.updateParent);
  const updatePlaytime = useProfilesStore((s) => s.updatePlaytime);

  const outProfiles = useMemo(
    () => [...profiles].filter((i) => i !== null).sort((a, b) => a.index - b.index),
    [profiles],
  );

  return {
    addProfile,
    profiles: outProfiles,
    loadProfiles,
    moveProfile,
    removeAll,
    removeProfile,
    selectedProfile,
    setSelectedProfile,
    toggleFavorite,
    updateProfile,
    updateLastPlayed,
    updatePlaytime,
    updateParent,
  };
};
