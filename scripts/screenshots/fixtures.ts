/**
 * Tauri command fixtures for the README screenshots.
 *
 * The capture browser stubs `window.__TAURI_INTERNALS__.invoke`, so every
 * command the frontend issues resolves against the map below. Keep the data
 * plausible: these images are published as what the app looks like.
 */

export interface FixtureOptions {
  /** The app version the mocked titlebar reports. */
  version: string;
}

const PROFILE_ROOT = "/Users/you/Library/Application Support/StoryForge/profiles";

/** Real mods with real artwork, so the browser looks like the live database. */
const MODS = [
  {
    modid: 604,
    assetid: 604,
    downloads: 824523,
    follows: 5471,
    trendingpoints: 0,
    comments: 716,
    name: "QP's Chisel Tools",
    summary: "Chisel and pantograph tools for copying builds, plus a portfolio to store them.",
    modidstrs: ["chiseltools"],
    author: "QPTech",
    urlalias: "chiseltools",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/modicon_910cef72d741fec6c488e5c5cf99f84f.png",
    tags: ["Utility", "Cosmetics", "QoL"],
    lastreleased: "2026-09-30 18:07:21",
  },
  {
    modid: 890,
    assetid: 890,
    downloads: 1073586,
    follows: 7923,
    trendingpoints: 0,
    comments: 760,
    name: "Carry On",
    summary:
      "Pick up, carry and place chests, crates and other containers while they keep their contents.",
    modidstrs: ["carryon"],
    author: "NerdScurvy",
    urlalias: "carryon",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/CarryOnLogo_aef8a4cbdf80f8b3851b5dc3b23e1a28.png",
    tags: ["Storage", "QoL"],
    lastreleased: "2026-08-12 05:03:34",
  },
  {
    modid: 322,
    assetid: 322,
    downloads: 986864,
    follows: 7111,
    trendingpoints: 0,
    comments: 2227,
    name: "Primitive Survival",
    summary: "Traps, fishing, smoking, tanning and other early-game survival systems.",
    modidstrs: ["primitivesurvival"],
    author: "SpearAndFang",
    urlalias: "primitivesurvival",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/logo3_dd03713f749ef0cf43fa5a03bf7991fa.png",
    tags: ["Creatures", "Food", "Farming", "Survival", "Storage", "Transportation"],
    lastreleased: "2026-09-19 18:58:54",
  },
  {
    modid: 843,
    assetid: 843,
    downloads: 779374,
    follows: 6469,
    trendingpoints: -3,
    comments: 1339,
    name: "A Culinary Artillery",
    summary: "Kitchen appliances, cookware and expanded meal cooking for Expanded Foods.",
    modidstrs: ["aculinaryartillery"],
    author: "l33tmaan",
    urlalias: "aculinaryartillery",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/a+culinary+artillery_e163040f04cde0e1a645e2a2a46e5999.png",
    tags: ["Technology", "Crafting", "Food", "Furniture", "Library"],
    lastreleased: "2026-09-28 02:54:37",
  },
  {
    modid: 16,
    assetid: 16,
    downloads: 759539,
    follows: 6760,
    trendingpoints: -3,
    comments: 1831,
    name: "Expanded Foods",
    summary: "Hundreds of new foods, recipes and cooking methods for a fuller kitchen.",
    modidstrs: ["expandedfoods"],
    author: "l33tmaan",
    urlalias: "expandedfoods",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/expanded+foods+moddb_209d8cdb85a57970a5753cef4c6f3bfc_480_320.png",
    tags: ["Utility", "Crafting", "Food", "Alcohol"],
    lastreleased: "2026-09-27 04:14:53",
  },
  {
    modid: 395,
    assetid: 395,
    downloads: 454062,
    follows: 4196,
    trendingpoints: 0,
    comments: 316,
    name: "Stone Quarry",
    summary: "Automated stone, ore and gem extraction with quarry machines.",
    modidstrs: ["stonequarry"],
    author: "DArkHekRoMaNT",
    urlalias: "stonequarry",
    side: "both",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/0_logo_da467a7d63ab6cb4f9bd6c56b0fa02d9.png",
    tags: ["Utility", "Crafting", "QoL"],
    lastreleased: "2025-09-13 16:05:31",
  },
  {
    modid: 321,
    assetid: 321,
    downloads: 54455,
    follows: 556,
    trendingpoints: 0,
    comments: 72,
    name: "ProspectorInfo",
    summary: "Saves prospecting readings on the map instead of on paper.",
    modidstrs: ["prospectorinfo"],
    author: "P3t3rix",
    urlalias: null,
    side: "client",
    type: "mod",
    logo: "https://moddbcdn.vintagestory.at/79952656-09e3f680-84_19d2d07cf2fccb82c431b7828bb2fc74.png",
    tags: ["Other", "QoL"],
    lastreleased: "2023-05-13 18:56:35",
  },
  {
    modid: 88,
    assetid: 88,
    downloads: 416679,
    follows: 2747,
    trendingpoints: 0,
    comments: 1209,
    name: "XSkills",
    summary: "Character skills, professions and abilities that level up as you play.",
    modidstrs: ["xskills"],
    author: "Xandu",
    urlalias: null,
    side: "both",
    type: "mod",
    logo: null,
    tags: ["Other", "QoL", "Tweak"],
    lastreleased: "2025-09-09 17:09:40",
  },
];

const MOD_TAGS = [
  { tagid: 1, name: "Utility", color: "#7f8c8d" },
  { tagid: 2, name: "QoL", color: "#3498db" },
  { tagid: 3, name: "Storage", color: "#e67e22" },
  { tagid: 4, name: "Crafting", color: "#16a085" },
  { tagid: 5, name: "Food", color: "#e74c3c" },
  { tagid: 6, name: "Creatures", color: "#9b59b6" },
  { tagid: 7, name: "Farming", color: "#27ae60" },
  { tagid: 8, name: "Survival", color: "#d35400" },
  { tagid: 9, name: "Transportation", color: "#2980b9" },
  { tagid: 10, name: "Technology", color: "#34495e" },
  { tagid: 11, name: "Furniture", color: "#8e44ad" },
  { tagid: 12, name: "Library", color: "#95a5a6" },
  { tagid: 13, name: "Cosmetics", color: "#f39c12" },
  { tagid: 14, name: "Alcohol", color: "#c0392b" },
  { tagid: 15, name: "Other", color: "#6e7681" },
  { tagid: 16, name: "Tweak", color: "#1abc9c" },
];

/** Latest release plus two older ones, keyed by numeric modid. */
const MOD_INFOS = Object.fromEntries(
  MODS.map((mod) => {
    const [major, minor, patch] = mod.lastreleased.split(" ")[0].split("-")[0].split(".");
    void major;
    void minor;
    void patch;
    const latest = latestVersion(mod);
    return [
      String(mod.modid),
      {
        mod: {
          ...mod,
          text: mod.summary,
          logofilename: null,
          logofile: mod.logo,
          logofiledb: mod.logo,
          homepageurl: null,
          sourcecodeurl: null,
          trailervideourl: null,
          issuetrackerurl: null,
          wikiurl: null,
          created: "2024-01-01 00:00:00",
          lastmodified: mod.lastreleased,
          screenshots: [],
          releases: [
            release(mod, latest),
            release(mod, previous(latest, 1)),
            release(mod, previous(latest, 2)),
          ],
        },
        statuscode: "200",
      },
    ];
  }),
);

function latestVersion(mod: (typeof MODS)[number]): string {
  const versions: Record<string, string> = {
    chiseltools: "1.17.8",
    carryon: "1.14.3",
    primitivesurvival: "5.1.4",
    aculinaryartillery: "2.0.0-dev.26",
    expandedfoods: "2.0.0-dev.15",
    stonequarry: "3.5.1",
    prospectorinfo: "4.3.0",
    xskills: "0.9.0-pre.2",
  };
  return versions[mod.modidstrs[0]] ?? "1.0.0";
}

/** Steps a `major.minor.patch[-tag]` version down for older release entries. */
function previous(version: string, steps: number): string {
  const [core, tag] = version.split("-");
  const parts = core.split(".").map(Number);
  parts[2] = Math.max(0, (parts[2] ?? 0) - steps);
  return `${parts.join(".")}${tag ? `-${tag}` : ""}`;
}

function release(mod: (typeof MODS)[number], version: string) {
  return {
    releaseid: mod.modid * 1000 + version.length,
    mainfile: `https://moddbcdn.vintagestory.at/${mod.modidstrs[0]}_${version}.zip`,
    filename: `${mod.modidstrs[0]}_${version}.zip`,
    fileid: mod.modid,
    downloads: Math.round(mod.downloads / 10),
    tags: [],
    modidstr: mod.modidstrs[0],
    modversion: version,
    created: mod.lastreleased,
    changelog: null,
  };
}

const PROFILES = [
  {
    id: 1,
    name: "Bangers & Mash",
    version: "1.21.5",
    startParams: "",
    path: `${PROFILE_ROOT}/bangers-mash`,
    size_bytes: 2_587_449_344,
    size_display: "2.41 GB",
    favorite: true,
    icon: "forestdawn.png",
    last_played: Date.parse("2026-10-01T19:42:00Z"),
    total_time_played: 183_600,
    modpack_slug: null,
    modpack_version: null,
    env_vars: {},
    external: false,
  },
  {
    id: 2,
    name: "Redwood Valley",
    version: "1.21.4",
    startParams: "--tracelog",
    path: `${PROFILE_ROOT}/redwood-valley`,
    size_bytes: 1_203_345_408,
    size_display: "1.12 GB",
    favorite: false,
    icon: "oldvillage.png",
    last_played: Date.parse("2026-09-28T16:05:00Z"),
    total_time_played: 96_480,
    modpack_slug: "redwood-valley",
    modpack_version: "1.2.0",
    env_vars: {},
    external: false,
  },
  {
    id: 3,
    name: "Creative",
    version: "1.21.5",
    startParams: "",
    path: `${PROFILE_ROOT}/creative`,
    size_bytes: 811_597_824,
    size_display: "774 MB",
    favorite: false,
    icon: "bogfort.png",
    last_played: null,
    total_time_played: 12_240,
    modpack_slug: null,
    modpack_version: null,
    env_vars: {},
    external: false,
  },
  {
    id: 4,
    name: "Test World",
    version: "1.20.9",
    startParams: "",
    path: `${PROFILE_ROOT}/test-world`,
    size_bytes: 402_653_184,
    size_display: "384 MB",
    favorite: false,
    icon: null,
    last_played: Date.parse("2026-08-14T09:30:00Z"),
    total_time_played: 3_600,
    modpack_slug: null,
    modpack_version: null,
    env_vars: {},
    external: false,
  },
];

const GAME_VERSIONS = [
  "1.21.5",
  "1.21.4",
  "1.21.3",
  "1.21.2",
  "1.21.1",
  "1.21.0",
  "1.20.9",
  "1.20.8",
  "1.20.7",
  "1.20.6",
  "1.20.5",
  "1.20.4",
];

const INSTALLED_VERSIONS = [
  {
    name: "1.21.5",
    size_bytes: 1_149_054_976,
    size_display: "1.07 GB",
    path: "/Users/you/Library/Application Support/StoryForge/versions/1.21.5",
    external: false,
    source: null,
  },
  {
    name: "1.21.4",
    size_bytes: 1_140_228_096,
    size_display: "1.06 GB",
    path: "/Users/you/Library/Application Support/StoryForge/versions/1.21.4",
    external: false,
    source: null,
  },
  {
    name: "1.21.3",
    size_bytes: 1_136_402_432,
    size_display: "1.06 GB",
    path: "/Users/you/Library/Application Support/StoryForge/versions/1.21.3",
    external: false,
    source: null,
  },
  {
    name: "1.20.9",
    size_bytes: 1_098_956_800,
    size_display: "1.02 GB",
    path: "/Users/you/Games/VS/1.20.9",
    external: true,
    source: "VS Launcher",
  },
];

/** Installed in the "Bangers & Mash" profile; two of them have updates. */
const INSTALLED_MODS = [
  installedMod("chiseltools", "QP's Chisel Tools", "QPTech", "1.17.8"),
  installedMod("carryon", "Carry On", "NerdScurvy", "1.14.2"),
  installedMod("primitivesurvival", "Primitive Survival", "SpearAndFang", "5.1.4"),
  installedMod("aculinaryartillery", "A Culinary Artillery", "l33tmaan", "2.0.0-dev.26"),
  installedMod("expandedfoods", "Expanded Foods", "l33tmaan", "2.0.0-dev.15"),
  installedMod("stonequarry", "Stone Quarry", "DArkHekRoMaNT", "3.5.0"),
];

function installedMod(modidstr: string, name: string, author: string, version: string) {
  return {
    modid: modidstr,
    name,
    authors: [author],
    version,
    path: `${PROFILE_ROOT}/bangers-mash/Mods/${modidstr}_${version}.zip`,
  };
}

const MOD_UPDATES = {
  statuscode: "200",
  updates: {
    carryon: {
      releaseid: 890_143,
      mainfile: "https://moddbcdn.vintagestory.at/CarryOn-1.22.0_v1.14.3.zip",
      filename: "CarryOn-1.22.0_v1.14.3.zip",
      fileid: 890,
      downloads: 120_000,
      tags: [],
      modidstr: "carryon",
      modversion: "1.14.3",
      created: "2026-08-12 05:03:34",
    },
    stonequarry: {
      releaseid: 395_351,
      mainfile: "https://moddbcdn.vintagestory.at/StoneQuarry_VS1.21.1_net8_v3.5.1.zip",
      filename: "StoneQuarry_VS1.21.1_net8_v3.5.1.zip",
      fileid: 395,
      downloads: 88_000,
      tags: [],
      modidstr: "stonequarry",
      modversion: "3.5.1",
      created: "2025-09-13 16:05:31",
    },
  },
};

const SAVES = [
  world(
    "Bangers & Mash",
    "Seraph's Landing",
    "Seraph",
    "2026-10-01T19:38:00Z",
    184_320,
    1_234_567_890,
    true,
  ),
  world(
    "Bangers & Mash",
    "The Long Winter",
    "Seraph",
    "2026-09-24T21:12:00Z",
    92_160,
    987_654_321,
    true,
  ),
  world(
    "Redwood Valley",
    "Redwood Valley",
    "Redwood",
    "2026-09-28T15:58:00Z",
    61_440,
    555_444_333,
    true,
  ),
  world("Creative", "Build Test", "Seraph", "2026-08-30T12:00:00Z", 7_200, 42_424_242, false),
];

function world(
  profileName: string,
  worldName: string,
  createdBy: string,
  lastPlayed: string,
  secondsPlayed: number,
  seed: number,
  hasMap: boolean,
) {
  return {
    data: {
      world_name: worldName,
      seed,
      created_by_player_name: createdBy,
      created_game_version: "1.21.4",
      last_saved_game_version: "1.21.5",
      last_played: lastPlayed,
      savegame_identifier: seed,
      total_seconds_played: secondsPlayed,
      total_game_seconds: secondsPlayed,
      map_size_x: 1_024_000,
      map_size_y: 256,
      map_size_z: 1_024_000,
      simulation_current_frame: secondsPlayed * 20,
      last_entity_id: 42_424,
      world_play_style: 0,
      player_data_by_uid: {},
      mod_data: {},
    },
    path: `/Users/you/Library/Application Support/StoryForge/profiles/${profileName.toLowerCase().replaceAll(" ", "-").replaceAll("&", "")}/Saves/${worldName}.vcdbs`,
    profile_name: profileName,
    has_map: hasMap,
    map_markers: hasMap ? { markers: [] } : null,
    prospecting_logs: [],
  };
}

const SAVED_SERVERS = [
  {
    id: 1,
    row_key: "1:1",
    name: "Anego Studios Official",
    ip: "play.vintagestory.at",
    port: 42420,
    password: "",
    profile_id: 1,
    profile_name: "Bangers & Mash",
    favorite: true,
  },
  {
    id: 2,
    row_key: "1:2",
    name: "Survival Friends",
    ip: "vs.friends.example",
    port: 42420,
    password: "hunter2",
    profile_id: 1,
    profile_name: "Bangers & Mash",
    favorite: false,
  },
  {
    id: 3,
    row_key: "2:3",
    name: "Redwood Creative",
    ip: "10.0.0.24",
    port: 42420,
    password: "",
    profile_id: 2,
    profile_name: "Redwood Valley",
    favorite: false,
  },
];

const PUBLIC_SERVERS = [
  publicServer("Vintage Story Official", "play.vintagestory.at", "1.21.5", 42, 64, 0),
  publicServer("Tyron's Testing Grounds", "test.vintagestory.at", "1.21.5", 12, 32, 0),
  publicServer("Anego Survival", "survival.anego.example", "1.21.5", 28, 40, 14),
  publicServer("Builders' Guild", "build.builders.example", "1.21.4", 17, 24, 6),
  publicServer("Hardcore Homestead", "hardcore.example.net", "1.21.5", 8, 16, 22),
  publicServer("Modded Mayhem", "mods.mayhem.example", "1.21.5", 35, 50, 48),
  publicServer("Peaceful Valley", "peaceful.valley.example", "1.21.4", 6, 20, 3),
  publicServer("Skyblock", "sky.example.org", "1.21.3", 21, 30, 31),
  publicServer("Roleplay Realm", "rp.realm.example", "1.21.5", 24, 60, 9),
  publicServer("Creative Sandbox", "creative.sandbox.example", "1.21.5", 4, 20, 0),
  publicServer("Winter is Coming", "winter.example.net", "1.21.4", 15, 32, 18),
  publicServer("The Bronze Age", "bronze.age.example", "1.21.3", 11, 24, 12),
];

function publicServer(
  name: string,
  ip: string,
  version: string,
  players: number,
  maxPlayers: number,
  modCount: number,
) {
  return {
    serverName: name,
    serverIP: `${ip}:42420`,
    playstyle: { id: "surviveandbuild", langCode: "en" },
    mods: Array.from({ length: modCount }, (_, index) => ({ id: `mod${index}`, version: "1.0.0" })),
    maxPlayers: String(maxPlayers),
    players,
    gameVersion: version,
    hasPassword: name.includes("Hardcore"),
    whitelisted: name.includes("Guild") || name.includes("Roleplay"),
    gameDescription: `${name} — a Vintage Story server. Be kind, build big.`,
  };
}

const HOSTED_SERVERS = [
  {
    id: 1,
    name: "Friends Server",
    version: "1.21.5",
    port: 42420,
    bind_ip: "0.0.0.0",
    data_dir: "/Users/you/Library/Application Support/StoryForge/hosted-servers/friends-server",
    start_params: "",
    favorite: true,
    last_played: Date.parse("2026-09-29T20:15:00Z"),
    total_time_played: 86_400,
  },
  {
    id: 2,
    name: "Public Test Server",
    version: "1.21.4",
    port: 42421,
    bind_ip: "0.0.0.0",
    data_dir: "/Users/you/Library/Application Support/StoryForge/hosted-servers/public-test",
    start_params: "--maxclients 16",
    favorite: false,
    last_played: null,
    total_time_played: 3_600,
  },
];

const MOD_CONFIGS = [
  {
    filename: "carryon.json",
    content: {
      enabled: true,
      carryCapacity: { base: 4, perStrength: 2 },
      allowStacking: true,
      droppedItemsLifetimeDays: 7,
    },
  },
  {
    filename: "chiseltools.json",
    content: {
      maxBlocksPerChisel: 64,
      pantographRadius: 12,
      allowCopyingBlockEntities: false,
    },
  },
  {
    filename: "xskills.json",
    content: {
      general: { xpRateMultiplier: 1.5, enableParticles: true },
      skills: { mining: { enabled: true }, cooking: { enabled: true } },
    },
  },
];

const NEWS = [
  {
    title: "v1.21.5 released",
    link: "https://www.vintagestory.at/forums/topic/1",
    description:
      '<p><strong>Dear Extraordinary Survivalists</strong><br />v1.21.5, a stable release, can now be downloaded through the <a href="https://account.vintagestory.at/">account manager</a>.</p><p>We\'ve accumulated a handful of small patches worthy of a release. The "/db prune" command should now finally work fully, but we still recommend making a backup of your savegame before using it.</p>',
    guid: "1",
    pubDate: "2026-09-30T18:00:00Z",
  },
  {
    title: "The Art of Vintage Story: A contest",
    link: "https://www.vintagestory.at/forums/topic/2",
    description:
      "<p>Share your best in-game screenshots and machinima for a chance to win a copy of the game and a place in our gallery. Submissions close at the end of the month.</p>",
    guid: "2",
    pubDate: "2026-09-18T12:00:00Z",
  },
  {
    title: "Server spotlight: Anego Survival",
    link: "https://www.vintagestory.at/forums/topic/3",
    description:
      "<p>This month we're spotlighting a long-running community server with 40 slots and a friendly, no-grief rule set.</p>",
    guid: "3",
    pubDate: "2026-09-02T09:30:00Z",
  },
  {
    title: "Modding update: 1.21 API notes",
    link: "https://www.vintagestory.at/forums/topic/4",
    description:
      "<p>A short summary of the API changes modders should account for when updating to 1.21, including the new asset paths and the client-side settings rework.</p>",
    guid: "4",
    pubDate: "2026-08-20T15:45:00Z",
  },
];

/** Map of Tauri command name to mocked response. */
export function createFixtures(options: FixtureOptions): Record<string, unknown> {
  return {
    "plugin:app|version": options.version,
    get_all_profiles: PROFILES,
    get_installed_versions: INSTALLED_VERSIONS,
    fetch_versions: GAME_VERSIONS,
    fetch_mods: MODS,
    fetch_mod_tags: MOD_TAGS,
    fetch_mod_info: MOD_INFOS,
    get_mods: { mods: INSTALLED_MODS },
    get_profile_mods: { mods: INSTALLED_MODS, errors: [] },
    get_mod_updates: MOD_UPDATES,
    get_mod_configs: MOD_CONFIGS,
    get_all_saves: SAVES,
    fetch_all_servers: SAVED_SERVERS,
    fetch_public_servers: { statuscode: "200", data: PUBLIC_SERVERS },
    get_all_hosted_servers: HOSTED_SERVERS,
    fetch_news: NEWS,
    sniff_server: { online: true },
    // Import banners stay hidden.
    detect_legacy_installations: [],
    detect_default_game_data: [],
    detect_vs_launcher_installations: [],
    detect_rustory_instances: [],
    detect_gruntlauncher_instances: [],
    detect_lithic_instances: [],
    detect_yelloowstone_instances: [],
    detect_mvl_modpacks: [],
    detect_waxlight_instances: [],
    detect_cairn_packs: [],
    detect_linkable_versions: [],
    list_deleted_profiles: [],
    load_accounts: [],
    scan_resume_manifests: [],
    is_flatpak_cmd: false,
    log_webview_gap: null,
    log_startup_time: null,
    log_message: null,
  };
}
