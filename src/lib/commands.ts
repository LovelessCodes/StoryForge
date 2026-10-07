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
  /** Key in the `layout` namespace; translated at render time. */
  descriptionKey?: string;
  groupKey: string;
  run: (runtime: CommandRuntime) => void;
  titleKey: string;
}

export const COMMANDS = {
  "app.commandPalette": {
    groupKey: "layout.commands.groups.application",
    titleKey: "layout.commands.commandPalette.title",
    descriptionKey: "layout.commands.commandPalette.description",
    run: (runtime) => runtime.openCommandPalette(),
  },
  "app.toggleSidebar": {
    groupKey: "layout.commands.groups.application",
    titleKey: "layout.commands.toggleSidebar",
    run: (runtime) => runtime.toggleSidebar(),
  },
  "app.toggleTheme": {
    groupKey: "layout.commands.groups.appearance",
    titleKey: "layout.commands.toggleTheme.title",
    descriptionKey: "layout.commands.toggleTheme.description",
    run: (runtime) => runtime.toggleTheme(),
  },
  "app.checkForUpdates": {
    groupKey: "layout.commands.groups.application",
    titleKey: "layout.commands.checkForUpdates",
    run: (runtime) => runtime.checkForUpdates(),
  },
  "app.refresh": {
    groupKey: "layout.commands.groups.application",
    titleKey: "layout.commands.refresh",
    run: (runtime) => runtime.refresh(),
  },
  "app.openProfilesFolder": {
    groupKey: "layout.commands.groups.application",
    titleKey: "layout.commands.openProfilesFolder",
    run: (runtime) => runtime.openProfilesFolder(),
  },
  "app.launchProfile": {
    groupKey: "layout.commands.groups.game",
    titleKey: "layout.commands.launchProfile",
    run: (runtime) => runtime.launchProfile(),
  },
  "nav.profiles": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.profiles",
    run: (runtime) => runtime.navigate("profiles"),
  },
  "nav.mods": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.mods",
    run: (runtime) => runtime.navigate("mods"),
  },
  "nav.modpacks": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.modpacks",
    run: (runtime) => runtime.navigate("modpacks"),
  },
  "nav.versions": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.versions",
    run: (runtime) => runtime.navigate("versions"),
  },
  "nav.worlds": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.worlds",
    run: (runtime) => runtime.navigate("worlds"),
  },
  "nav.servers": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.servers",
    run: (runtime) => runtime.navigate("servers"),
  },
  "nav.config": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.config",
    run: (runtime) => runtime.navigate("config"),
  },
  "nav.news": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.news",
    run: (runtime) => runtime.navigate("news"),
  },
  "nav.settings": {
    groupKey: "layout.commands.groups.goTo",
    titleKey: "layout.nav.settings",
    run: (runtime) => runtime.navigate("settings"),
  },
} satisfies Record<string, CommandDefinition>;

export type AppCommandId = keyof typeof COMMANDS;

/** Widened accessor: the registry's literal types narrow `descriptionKey` away. */
export function getCommand(id: AppCommandId): CommandDefinition {
  return COMMANDS[id];
}
