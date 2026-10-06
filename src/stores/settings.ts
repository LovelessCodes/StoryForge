import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import { logToFile } from "@/lib/logger";
import type { SortBy } from "@/lib/mod-sort";

export type SetParentConfigProps = {
  deleteCurrentData: boolean;
  moveCurrentData: boolean;
};

type SettingsStore = {
  /** Id of the profile the UI (and the sidebar Play button) targets. */
  activeProfileId: number | null;
  setActiveProfileId: (id: number | null) => void;
  /** UI language: "system" or a bundled locale code. */
  language: string;
  setLanguage: (language: string) => void;
  /** User hid the "import installations from the previous app" banner. */
  legacyMigrationDismissed: boolean;
  dismissLegacyMigration: () => void;
  /** User hid the "use your existing Vintage Story data" banner. */
  gameDataDismissed: boolean;
  dismissGameData: () => void;
  /** User hid the "import installations from VS Launcher" banner. */
  vsLauncherDismissed: boolean;
  dismissVsLauncher: () => void;
  /** User hid the "import modpacks from MVL" banner. */
  mvlDismissed: boolean;
  dismissMvl: () => void;
  /** User hid the "import instances from Waxlight Launcher" banner. */
  waxlightDismissed: boolean;
  dismissWaxlight: () => void;
  /** User hid the "link game versions from other launchers" banner. */
  linkVersionsDismissed: boolean;
  dismissLinkVersions: () => void;
  /** User hid the "import packs from Cairn" banner. */
  cairnDismissed: boolean;
  dismissCairn: () => void;
  /** User hid the "import instances from Rustory" banner. */
  rustoryDismissed: boolean;
  dismissRustory: () => void;
  /** User hid the "import instances from GruntLauncher" banner. */
  gruntLauncherDismissed: boolean;
  dismissGruntLauncher: () => void;
  /** User hid the "import instances from Lithic" banner. */
  lithicDismissed: boolean;
  dismissLithic: () => void;
  /** User hid the "import instances from Yelloowstone" banner. */
  yelloowstoneDismissed: boolean;
  dismissYelloowstone: () => void;
  /**
   * Mods pinned to their installed version, keyed by profile/server path.
   * Pinned mods are excluded from update checks and "Update All".
   */
  pinnedMods: Record<string, string[]>;
  toggleModPin: (path: string, modid: string) => void;
  /**
   * Update releases the user skipped, keyed by lowercased modidstr. Only the
   * named version is skipped; a newer release shows up again.
   */
  skippedModUpdates: Record<string, string>;
  skipModUpdate: (modidstr: string, version: string) => void;
  clearModUpdateSkip: (modidstr: string) => void;
  /** Favourite mod listings (lowercased modidstrs), shared across profiles. */
  favoriteMods: string[];
  toggleFavoriteMod: (modidstr: string) => void;
  defaultModSortBy: SortBy;
  setDefaultModSortBy: (sortBy: SortBy) => void;
  /** Apply the source profile's settings to every other profile on launch. */
  applyGameDefaults: boolean;
  setApplyGameDefaults: (applyGameDefaults: boolean) => void;
  /** Profile whose live settings are the source of truth, or null. */
  gameDefaultsProfileId: number | null;
  setGameDefaultsProfileId: (id: number | null) => void;
  /** Read the source profile's account session too. */
  gameDefaultsIncludeAccount: boolean;
  setGameDefaultsIncludeAccount: (include: boolean) => void;
  /** Mod id from a `storyforge://install?mod=…` link, for the Mods page. */
  pendingDeepLinkMod: string | null;
  setPendingDeepLinkMod: (modid: string | null) => void;
  /** Modpack slug from a `storyforge://install?pack=…` link, for the Modpacks page. */
  pendingDeepLinkPack: string | null;
  setPendingDeepLinkPack: (slug: string | null) => void;
  profilesParent: string | null;
  profilesSubdir: string;
  setProfilesParent: (path: string | null, config?: SetParentConfigProps) => Promise<void>;
  versionsParent: string | null;
  versionsSubdir: string;
  setVersionsParent: (path: string | null, config?: SetParentConfigProps) => Promise<void>;
  streamMode: boolean;
  toggleStreamMode: () => void;
  useSystemDotnet: boolean;
  toggleUseSystemDotnet: () => void;
};

export const useSettingsStore = create<SettingsStore>()((set, _get, store) => ({
  activeProfileId: null,
  setActiveProfileId: (id) => set(() => ({ activeProfileId: id })),
  language: "system",
  setLanguage: (language) => set(() => ({ language })),
  legacyMigrationDismissed: false,
  dismissLegacyMigration: () => set(() => ({ legacyMigrationDismissed: true })),
  gameDataDismissed: false,
  dismissGameData: () => set(() => ({ gameDataDismissed: true })),
  vsLauncherDismissed: false,
  dismissVsLauncher: () => set(() => ({ vsLauncherDismissed: true })),
  mvlDismissed: false,
  dismissMvl: () => set(() => ({ mvlDismissed: true })),
  waxlightDismissed: false,
  dismissWaxlight: () => set(() => ({ waxlightDismissed: true })),
  linkVersionsDismissed: false,
  dismissLinkVersions: () => set(() => ({ linkVersionsDismissed: true })),
  cairnDismissed: false,
  dismissCairn: () => set(() => ({ cairnDismissed: true })),
  rustoryDismissed: false,
  dismissRustory: () => set(() => ({ rustoryDismissed: true })),
  gruntLauncherDismissed: false,
  dismissGruntLauncher: () => set(() => ({ gruntLauncherDismissed: true })),
  lithicDismissed: false,
  dismissLithic: () => set(() => ({ lithicDismissed: true })),
  yelloowstoneDismissed: false,
  dismissYelloowstone: () => set(() => ({ yelloowstoneDismissed: true })),
  pinnedMods: {},
  toggleModPin: (path, modid) =>
    set((state) => {
      const id = modid.toLowerCase();
      const current = state.pinnedMods[path] ?? [];
      const next = current.includes(id)
        ? current.filter((pinned) => pinned !== id)
        : [...current, id];
      const pinnedMods = { ...state.pinnedMods };
      if (next.length > 0) pinnedMods[path] = next;
      else delete pinnedMods[path];
      return { pinnedMods };
    }),
  skippedModUpdates: {},
  skipModUpdate: (modidstr, version) =>
    set((state) => ({
      skippedModUpdates: { ...state.skippedModUpdates, [modidstr.toLowerCase()]: version },
    })),
  clearModUpdateSkip: (modidstr) =>
    set((state) => {
      const skippedModUpdates = { ...state.skippedModUpdates };
      delete skippedModUpdates[modidstr.toLowerCase()];
      return { skippedModUpdates };
    }),
  favoriteMods: [],
  toggleFavoriteMod: (modidstr) =>
    set((state) => {
      const id = modidstr.toLowerCase();
      return {
        favoriteMods: state.favoriteMods.includes(id)
          ? state.favoriteMods.filter((favorite) => favorite !== id)
          : [...state.favoriteMods, id],
      };
    }),
  defaultModSortBy: "trending",
  setDefaultModSortBy: (sortBy) => set(() => ({ defaultModSortBy: sortBy })),
  applyGameDefaults: false,
  setApplyGameDefaults: (applyGameDefaults) => set(() => ({ applyGameDefaults })),
  gameDefaultsProfileId: null,
  setGameDefaultsProfileId: (gameDefaultsProfileId) => set(() => ({ gameDefaultsProfileId })),
  gameDefaultsIncludeAccount: false,
  setGameDefaultsIncludeAccount: (gameDefaultsIncludeAccount) =>
    set(() => ({ gameDefaultsIncludeAccount })),
  pendingDeepLinkMod: null,
  setPendingDeepLinkMod: (pendingDeepLinkMod) => set(() => ({ pendingDeepLinkMod })),
  pendingDeepLinkPack: null,
  setPendingDeepLinkPack: (pendingDeepLinkPack) => set(() => ({ pendingDeepLinkPack })),
  profilesParent: null,
  profilesSubdir: "profiles",
  setProfilesParent: async (path, config) => {
    const appFolder = await appDataDir();
    const { profilesParent, profilesSubdir } = store.getState();
    const dest = path ?? appFolder;
    const src = profilesParent ?? appFolder;
    if (config?.moveCurrentData) {
      await logToFile(
        "INFO ",
        `[settings] move_profiles: ${src}/${profilesSubdir} -> ${dest}/${profilesSubdir}`,
      );
      await invoke("move_profiles_folder", {
        destination: dest,
        source: src,
        subdir: profilesSubdir,
      });
    } else if (config?.deleteCurrentData) {
      await logToFile("INFO ", `[settings] remove_all_profiles: ${src}/${profilesSubdir}`);
      await invoke("remove_all_profiles", {
        source: src,
        subdir: profilesSubdir,
      });
    } else {
      await logToFile("INFO ", `[settings] set_profiles_parent: ${dest}`);
    }
    set(() => ({ profilesParent: path }));
  },
  setVersionsParent: async (path, config) => {
    const appFolder = await appDataDir();
    const { versionsParent, versionsSubdir } = store.getState();
    const dest = path ?? appFolder;
    const src = versionsParent ?? appFolder;
    if (config?.moveCurrentData) {
      await logToFile(
        "INFO ",
        `[settings] move_versions: ${src}/${versionsSubdir} -> ${dest}/${versionsSubdir}`,
      );
      await invoke("move_versions_folder", {
        destination: dest,
        source: src,
        subdir: versionsSubdir,
      });
    } else if (config?.deleteCurrentData) {
      await logToFile("INFO ", `[settings] remove_all_versions: ${src}/${versionsSubdir}`);
      await invoke("remove_all_versions", {
        source: src,
        subdir: versionsSubdir,
      });
    } else {
      await logToFile("INFO ", `[settings] set_versions_parent: ${dest}`);
    }
    set(() => ({ versionsParent: path }));
  },
  streamMode: false,
  toggleUseSystemDotnet: () => set((state) => ({ useSystemDotnet: !state.useSystemDotnet })),
  toggleStreamMode: () => set((state) => ({ streamMode: !state.streamMode })),
  useSystemDotnet: true,
  versionsParent: null,
  versionsSubdir: "versions",
}));

export const tauriSettingsHandler = createTauriStore("settings", useSettingsStore, {
  saveOnChange: true,
});
