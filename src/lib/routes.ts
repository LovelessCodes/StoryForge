export const PAGE_PATHS = {
  dashboard: "/",
  profiles: "/profiles",
  mods: "/mods",
  modpacks: "/modpacks",
  versions: "/versions",
  worlds: "/worlds",
  servers: "/servers",
  config: "/config",
  news: "/news",
  settings: "/settings",
} as const;

export type RoutePage = keyof typeof PAGE_PATHS;
