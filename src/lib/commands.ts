import type { RoutePage } from "./routes";

/** Everything a command may need from the running app. */
export interface CommandRuntime {
  checkForUpdates: () => void;
  launchProfile: () => void;
  navigate: (page: RoutePage) => void;
  openCommandPalette: () => void;
  openProfilesFolder: () => void;
  refresh: () => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
}

export interface CommandDefinition {
  description?: string;
  group: string;
  run: (runtime: CommandRuntime) => void;
  title: string;
}

export const COMMANDS = {
  "app.commandPalette": {
    group: "Application",
    title: "Open command palette",
    description: "Search pages and actions",
    run: (runtime) => runtime.openCommandPalette(),
  },
  "app.toggleSidebar": {
    group: "Application",
    title: "Toggle sidebar",
    run: (runtime) => runtime.toggleSidebar(),
  },
  "app.toggleTheme": {
    group: "Appearance",
    title: "Toggle theme",
    description: "Switch between light and dark",
    run: (runtime) => runtime.toggleTheme(),
  },
  "app.checkForUpdates": {
    group: "Application",
    title: "Check for updates",
    run: (runtime) => runtime.checkForUpdates(),
  },
  "app.refresh": {
    group: "Application",
    title: "Refresh data",
    run: (runtime) => runtime.refresh(),
  },
  "app.openProfilesFolder": {
    group: "Application",
    title: "Open profiles folder",
    run: (runtime) => runtime.openProfilesFolder(),
  },
  "app.launchProfile": {
    group: "Game",
    title: "Launch active profile",
    run: (runtime) => runtime.launchProfile(),
  },
  "nav.profiles": {
    group: "Go to",
    title: "Profiles",
    run: (runtime) => runtime.navigate("profiles"),
  },
  "nav.mods": {
    group: "Go to",
    title: "Mods",
    run: (runtime) => runtime.navigate("mods"),
  },
  "nav.modpacks": {
    group: "Go to",
    title: "Modpacks",
    run: (runtime) => runtime.navigate("modpacks"),
  },
  "nav.versions": {
    group: "Go to",
    title: "Versions",
    run: (runtime) => runtime.navigate("versions"),
  },
  "nav.worlds": {
    group: "Go to",
    title: "Worlds",
    run: (runtime) => runtime.navigate("worlds"),
  },
  "nav.servers": {
    group: "Go to",
    title: "Servers",
    run: (runtime) => runtime.navigate("servers"),
  },
  "nav.config": {
    group: "Go to",
    title: "Mod Configs",
    run: (runtime) => runtime.navigate("config"),
  },
  "nav.news": {
    group: "Go to",
    title: "News",
    run: (runtime) => runtime.navigate("news"),
  },
  "nav.settings": {
    group: "Go to",
    title: "Settings",
    run: (runtime) => runtime.navigate("settings"),
  },
} satisfies Record<string, CommandDefinition>;

export type AppCommandId = keyof typeof COMMANDS;

/** Widened accessor: the registry's literal types narrow `description` away. */
export function getCommand(id: AppCommandId): CommandDefinition {
  return COMMANDS[id];
}
