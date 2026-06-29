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

export type MapPieceDb = {
  pixels: number[][];
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
  last_played: string;
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
  installation_name: string;
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
