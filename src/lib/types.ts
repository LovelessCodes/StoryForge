export type ProgressPayload = {
  phase: string;
  downloaded: number | null;
  total: number | null;
  percent: number | null;
  current: number | null;
  count: number | null;
  message: string | null;
};

export type PausedDownload = {
  label: string;
  offset: number;
  url: string;
  filepath: string;
};

export type ModTag = {
  tagid: number;
  name: string;
  color: string;
};

export type Release = {
  releaseid: number;
  mainfile: string;
  filename: string;
  fileid: number;
  downloads: number;
  tags: string[];
  modidstr: string;
  modversion: string;
  created: string;
  changelog: string | null;
};

export type ModInfo = {
  mod: {
    modid: number;
    assetid: number;
    name: string;
    text: string;
    author: string;
    urlalias: string;
    logofilename: string | null;
    logofile: string | null;
    logofiledb: string | null;
    homepageurl: string | null;
    sourcecodeurl: string | null;
    trailervideourl: string | null;
    issuetrackerurl: string | null;
    wikiurl: string | null;
    downloads: number;
    follows: number;
    trendingpoints: number;
    comments: number;
    side: string;
    type: string;
    created: string;
    lastreleased: string;
    lastmodified: string;
    tags: string[];
    releases: Release[];
    screenshots: string[];
  };
  statuscode: string;
};

// Map-related types
export type TableInfo = {
  name: string;
  schema: string;
};

export type MapDatabaseInfo = {
  exists: boolean;
  tables: TableInfo[];
  tile_count: number;
  sample_positions: number[];
};

export type MapTile = {
  x: number;
  y: number;
  position: number;
  image_data: number[]; // Vec<u8> from Rust
  width: number;
  height: number;
};

export type MapBounds = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  tile_count: number;
};

export type Cuboidi = {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
};

export type LandClaim = {
  areas: Cuboidi[];
  protection_level: number;
  owned_by_entity_id: number;
  owned_by_player_uid: string;
  owned_by_player_group_uid: number;
  last_known_owner_name: string;
  description: string;
  permitted_player_group_ids: Record<number, number>;
  permitted_player_uids: Record<string, number>;
  permitted_player_last_known_player_name: Record<string, string>;
  allow_use_everyone: boolean;
  allow_traverse_everyone: boolean;
};

/** JSON value types used by the config editor and command payloads. */
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export interface JSONObject {
  [k: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

export type MapPieceDb = {
  /** Flat `Vec<i32>` on the Rust side. */
  pixels: number[];
};

export type ServerWorldPlayerData = {
  player_uid: string;
  inventories_serialized: Record<string, unknown>[];
  entity_player_serialized: unknown;
  game_mode: number;
  move_speed_multiplier: number;
  free_move: boolean;
  no_clip: boolean;
  viewdistance: number;
  selected_hotbarslot: number;
  free_move_plane_lock: number;
  picking_range: number;
  area_selection_mode: boolean;
  did_select_skin: boolean;
  spawn_position: PlayerSpawnPos;
  mod_data: Record<string, unknown>;
  previous_picking_range: number;
  deaths: number;
  render_meta_blocks: boolean;
};

export type PlayerSpawnPos = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  remaining_uses: number;
};

export type GameData = {
  map_size_x: number;
  map_size_y: number;
  map_size_z: number;
  player_data_by_uid: Record<string, ServerWorldPlayerData>;
  seed: number;
  simulation_current_frame: number;
  last_entity_id: number;
  mod_data: Record<string, unknown>; // This is a dictionary with string keys and unknown values - sometimes protobuf encoded byte arrays
  total_game_seconds: number;
  world_name: string;
  total_seconds_played: number;
  world_play_style: number;
  /** Optional on the Rust side. */
  last_played: string | null;
  created_game_version: string;
  game_time_speed: number;
  mini_dimensions_created: number;
  last_saved_game_version: string | null;
  created_by_player_name: string;
  entity_spawning: boolean;
  hours_per_day: number;
  last_herd_id: number;
  land_claims: LandClaim[];
  time_speed_modifiers: Record<string, number>;
  play_style: string;
  world_type: string;
  world_config_bytes: unknown;
  play_style_lang_code: string;
  last_block_item_mapping_version: number;
  savegame_identifier: string;
  calendar_speed_mul: number;
  remappings_applied_by_code: Record<string, boolean>;
  highest_chunkdata_version: number;
  total_game_seconds_start: number;
  created_world_gen_version: number;
  default_spawn: PlayerSpawnPos;
};

export type World = {
  data: GameData;
  path: string;
  profile_name: string;
  has_map: boolean;
  map_markers: MapMarkers | null;
  prospecting_logs: [string, ProspectingLog][];
};

export type Position = {
  x: number;
  y: number;
  z: number;
};

export type MapMarkers = {
  markers: MapMarker[];
};

export type MapMarker = {
  color: number;
  icon: string;
  opacity: number;
  player_uid: string;
  number: number | null;
  position: Position;
  label: string;
  id: string;
};

export type ProspectingLog = {
  markers: ProspectingMarker[];
};

export type ProspectResult = {
  ore_code: string;
  readings: ProspectReading | null;
};

export type ProspectReading = {
  depth: number;
  quality: number;
};

export type ProspectingMarker = {
  position: Position | null;
  results: ProspectResult[];
};

// ── Mods & profiles ──

/** A mod installed in a profile folder (zip on disk). */
export type OutputMod = {
  modid: string;
  name: string;
  authors: string[];
  version: string;
  path: string;
  /** `modinfo.json` dependencies (modid -> version requirement). */
  dependencies?: Record<string, string>;
  /** True when the profile lists this mod as disabled in `disabledMods`. */
  disabled?: boolean;
};

/** One `.zip` in a profile's Mods folder that could not be scanned. */
export type ModScanError = {
  file: string;
  stage: string;
  message: string;
};

/** A mod as returned by the mod database search endpoint. */
export type Mod = {
  modid: number;
  assetid: number;
  downloads: number;
  follows: number;
  trendingpoints: number;
  comments: number;
  name: string;
  summary: string;
  modidstrs: string[];
  author: string;
  urlalias: string | null;
  side: string;
  type: string;
  logo: string | null;
  tags: string[];
  lastreleased: string;
};

export type ModFilterState = {
  searchText: string;
  selectedModTags: { tagid: number; name: string; color: string }[];
  selectedGameVersions: string[];
  sortBy: "created" | "name" | "trending" | "downloads" | "follows" | "comments" | "updated";
  orderDirection: "ascending" | "descending";
  author: string;
  side: "any" | "client" | "server" | "both" | "installed";
  category: "mod" | "externaltool" | "other";
};

/** Local profile export payload (file or share code). */
export type ProfileExportPayload = {
  format: string;
  name: string;
  version: string;
  startParams: string;
  mods: string;
  modpackSlug?: string | null;
  modpackVersion?: string | null;
  envVars?: Record<string, string>;
};

export type DeletedProfile = {
  archive_name: string;
  name: string;
  version: string;
  mod_count: number;
  deleted_at: number;
};

export type ModsResult = {
  mods: OutputMod[];
  errors: { file: string; stage: string; message: string }[];
};

export interface LogChunk {
  text: string;
  path: string | null;
  offset: number;
  reset: boolean;
  truncated: boolean;
}

// ── Legacy installations migration (previous Story Forge release) ──

export type LegacyInstallation = {
  name: string;
  version: string;
  folder: string;
  path: string;
  size_bytes: number;
  size_display: string;
  mod_count: number;
  already_migrated: boolean;
};

export type LegacyMigrationSkip = {
  name: string;
  reason: string;
};

export type LegacyMigrationReport = {
  migrated: number;
  skipped: LegacyMigrationSkip[];
};

// ── Existing Vintage Story data (adoption) ──

export type DetectedGameData = {
  path: string;
  mod_count: number;
  size_bytes: number;
  size_display: string;
  has_saves: boolean;
  registered: boolean;
};

// ── Linked (external) game versions ──

export type LinkableVersion = {
  name: string;
  path: string;
  source: string;
  /** A version with this name already exists in the versions folder. */
  installed: boolean;
  /** Already linked to this exact path. */
  linked: boolean;
};

export type LinkSkip = {
  name: string;
  reason: string;
};

export type LinkVersionsReport = {
  linked: number;
  skipped: LinkSkip[];
};

// ── Third-party launcher imports (VS Launcher, MVL) ──

export type ForeignInstallation = {
  id: string;
  name: string;
  version: string;
  path: string;
  /** Which tool listed it ("VS Launcher", "RiftLauncher", "MVL", …). */
  source: string;
  mod_count: number;
  size_bytes: number;
  size_display: string;
  has_saves: boolean;
  last_time_played: number | null;
  /** Points at the game's own default data folder. */
  is_default_game_data: boolean;
  already_imported: boolean;
};
