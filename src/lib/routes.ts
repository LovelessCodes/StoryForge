export const PAGE_PATHS = {
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
