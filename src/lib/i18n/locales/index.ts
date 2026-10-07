// Assembles the per-area locale files into i18next resources.
// i18next needs static imports, so every file is listed explicitly here —
// add a line when adding a language or an area.

import de_auth from "./de/auth.json";
import de_common from "./de/common.json";
import de_config from "./de/config.json";
import de_downloads from "./de/downloads.json";
import de_hosting from "./de/hosting.json";
import de_layout from "./de/layout.json";
import de_modpacks from "./de/modpacks.json";
import de_mods from "./de/mods.json";
import de_news from "./de/news.json";
import de_profiles from "./de/profiles.json";
import de_servers from "./de/servers.json";
import de_settings from "./de/settings.json";
import de_versions from "./de/versions.json";
import de_worlds from "./de/worlds.json";
import en_auth from "./en/auth.json";
import en_common from "./en/common.json";
import en_config from "./en/config.json";
import en_downloads from "./en/downloads.json";
import en_hosting from "./en/hosting.json";
import en_layout from "./en/layout.json";
import en_modpacks from "./en/modpacks.json";
import en_mods from "./en/mods.json";
import en_news from "./en/news.json";
import en_profiles from "./en/profiles.json";
import en_servers from "./en/servers.json";
import en_settings from "./en/settings.json";
import en_versions from "./en/versions.json";
import en_worlds from "./en/worlds.json";
import es_auth from "./es/auth.json";
import es_common from "./es/common.json";
import es_config from "./es/config.json";
import es_downloads from "./es/downloads.json";
import es_hosting from "./es/hosting.json";
import es_layout from "./es/layout.json";
import es_modpacks from "./es/modpacks.json";
import es_mods from "./es/mods.json";
import es_news from "./es/news.json";
import es_profiles from "./es/profiles.json";
import es_servers from "./es/servers.json";
import es_settings from "./es/settings.json";
import es_versions from "./es/versions.json";
import es_worlds from "./es/worlds.json";
import fr_auth from "./fr/auth.json";
import fr_common from "./fr/common.json";
import fr_config from "./fr/config.json";
import fr_downloads from "./fr/downloads.json";
import fr_hosting from "./fr/hosting.json";
import fr_layout from "./fr/layout.json";
import fr_modpacks from "./fr/modpacks.json";
import fr_mods from "./fr/mods.json";
import fr_news from "./fr/news.json";
import fr_profiles from "./fr/profiles.json";
import fr_servers from "./fr/servers.json";
import fr_settings from "./fr/settings.json";
import fr_versions from "./fr/versions.json";
import fr_worlds from "./fr/worlds.json";
import ptBR_auth from "./pt-BR/auth.json";
import ptBR_common from "./pt-BR/common.json";
import ptBR_config from "./pt-BR/config.json";
import ptBR_downloads from "./pt-BR/downloads.json";
import ptBR_hosting from "./pt-BR/hosting.json";
import ptBR_layout from "./pt-BR/layout.json";
import ptBR_modpacks from "./pt-BR/modpacks.json";
import ptBR_mods from "./pt-BR/mods.json";
import ptBR_news from "./pt-BR/news.json";
import ptBR_profiles from "./pt-BR/profiles.json";
import ptBR_servers from "./pt-BR/servers.json";
import ptBR_settings from "./pt-BR/settings.json";
import ptBR_versions from "./pt-BR/versions.json";
import ptBR_worlds from "./pt-BR/worlds.json";
import ru_auth from "./ru/auth.json";
import ru_common from "./ru/common.json";
import ru_config from "./ru/config.json";
import ru_downloads from "./ru/downloads.json";
import ru_hosting from "./ru/hosting.json";
import ru_layout from "./ru/layout.json";
import ru_modpacks from "./ru/modpacks.json";
import ru_mods from "./ru/mods.json";
import ru_news from "./ru/news.json";
import ru_profiles from "./ru/profiles.json";
import ru_servers from "./ru/servers.json";
import ru_settings from "./ru/settings.json";
import ru_versions from "./ru/versions.json";
import ru_worlds from "./ru/worlds.json";
import zhCN_auth from "./zh-CN/auth.json";
import zhCN_common from "./zh-CN/common.json";
import zhCN_config from "./zh-CN/config.json";
import zhCN_downloads from "./zh-CN/downloads.json";
import zhCN_hosting from "./zh-CN/hosting.json";
import zhCN_layout from "./zh-CN/layout.json";
import zhCN_modpacks from "./zh-CN/modpacks.json";
import zhCN_mods from "./zh-CN/mods.json";
import zhCN_news from "./zh-CN/news.json";
import zhCN_profiles from "./zh-CN/profiles.json";
import zhCN_servers from "./zh-CN/servers.json";
import zhCN_settings from "./zh-CN/settings.json";
import zhCN_versions from "./zh-CN/versions.json";
import zhCN_worlds from "./zh-CN/worlds.json";

export const resources = {
  en: {
    common: en_common,
    layout: en_layout,
    profiles: en_profiles,
    mods: en_mods,
    versions: en_versions,
    worlds: en_worlds,
    servers: en_servers,
    hosting: en_hosting,
    modpacks: en_modpacks,
    news: en_news,
    config: en_config,
    downloads: en_downloads,
    settings: en_settings,
    auth: en_auth,
  },
  de: {
    common: de_common,
    layout: de_layout,
    profiles: de_profiles,
    mods: de_mods,
    versions: de_versions,
    worlds: de_worlds,
    servers: de_servers,
    hosting: de_hosting,
    modpacks: de_modpacks,
    news: de_news,
    config: de_config,
    downloads: de_downloads,
    settings: de_settings,
    auth: de_auth,
  },
  fr: {
    common: fr_common,
    layout: fr_layout,
    profiles: fr_profiles,
    mods: fr_mods,
    versions: fr_versions,
    worlds: fr_worlds,
    servers: fr_servers,
    hosting: fr_hosting,
    modpacks: fr_modpacks,
    news: fr_news,
    config: fr_config,
    downloads: fr_downloads,
    settings: fr_settings,
    auth: fr_auth,
  },
  es: {
    common: es_common,
    layout: es_layout,
    profiles: es_profiles,
    mods: es_mods,
    versions: es_versions,
    worlds: es_worlds,
    servers: es_servers,
    hosting: es_hosting,
    modpacks: es_modpacks,
    news: es_news,
    config: es_config,
    downloads: es_downloads,
    settings: es_settings,
    auth: es_auth,
  },
  "pt-BR": {
    common: ptBR_common,
    layout: ptBR_layout,
    profiles: ptBR_profiles,
    mods: ptBR_mods,
    versions: ptBR_versions,
    worlds: ptBR_worlds,
    servers: ptBR_servers,
    hosting: ptBR_hosting,
    modpacks: ptBR_modpacks,
    news: ptBR_news,
    config: ptBR_config,
    downloads: ptBR_downloads,
    settings: ptBR_settings,
    auth: ptBR_auth,
  },
  ru: {
    common: ru_common,
    layout: ru_layout,
    profiles: ru_profiles,
    mods: ru_mods,
    versions: ru_versions,
    worlds: ru_worlds,
    servers: ru_servers,
    hosting: ru_hosting,
    modpacks: ru_modpacks,
    news: ru_news,
    config: ru_config,
    downloads: ru_downloads,
    settings: ru_settings,
    auth: ru_auth,
  },
  "zh-CN": {
    common: zhCN_common,
    layout: zhCN_layout,
    profiles: zhCN_profiles,
    mods: zhCN_mods,
    versions: zhCN_versions,
    worlds: zhCN_worlds,
    servers: zhCN_servers,
    hosting: zhCN_hosting,
    modpacks: zhCN_modpacks,
    news: zhCN_news,
    config: zhCN_config,
    downloads: zhCN_downloads,
    settings: zhCN_settings,
    auth: zhCN_auth,
  },
};
