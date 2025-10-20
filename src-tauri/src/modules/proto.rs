#![allow(dead_code)]
// NOTE: These proto definitions mirror messages emitted by the Vintage Story API.
// Some types are not yet instantiated directly in the Rust backend, but we retain
// them for forward compatibility with serialized data exchanged with the client.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, Copy, PartialEq, Eq, ::prost::Enumeration)]
#[repr(i32)]
pub enum EnumBlockAccessFlags {
    None = 0,
    BuildOrBreak = 1,
    Use = 2,
    Traverse = 4,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy, PartialEq, Eq, ::prost::Enumeration)]
#[repr(i32)]
pub enum EnumFreeMovAxisLock {
    None = 0,
    X = 1,
    Y = 2,
    Z = 3,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy, PartialEq, Eq, ::prost::Enumeration)]
#[repr(i32)]
pub enum EnumGameMode {
    Guest = 0,
    Survival = 1,
    Creative = 2,
    Spectator = 3,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy, PartialEq, Eq, ::prost::Enumeration)]
#[repr(i32)]
pub enum EnumPlayStyle {
    WildernessSurvival = 0,
    SurviveAndBuild = 1,
    SurviveAndAutomate = 2,
    CreativeBuilding = 3,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct BlockPos {
    #[prost(int32, tag = "1", default = "0")]
    pub x: i32,
    #[prost(int32, tag = "2", default = "0")]
    pub internal_y: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub z: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct Cuboidi {
    #[prost(int32, tag = "1", default = "0")]
    pub x1: i32,
    #[prost(int32, tag = "2", default = "0")]
    pub y1: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub z1: i32,
    #[prost(int32, tag = "4", default = "0")]
    pub x2: i32,
    #[prost(int32, tag = "5", default = "0")]
    pub y2: i32,
    #[prost(int32, tag = "6", default = "0")]
    pub z2: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct GeneratedStructure {
    #[prost(string, tag = "1")]
    pub code: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub group: ::prost::alloc::string::String,
    #[prost(message, optional, tag = "3")]
    pub location: ::core::option::Option<Cuboidi>,
    #[prost(bool, tag = "4", default = "false")]
    pub suppress_rivulets: bool,
    #[prost(bool, tag = "5", default = "false")]
    pub suppress_trees_and_shrubs: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct IntDataMap2d {
    #[prost(int32, repeated, packed = "true", tag = "1")]
    pub data: ::prost::alloc::vec::Vec<i32>,
    #[prost(int32, tag = "2", default = "0")]
    pub size: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub top_left_padding: i32,
    #[prost(int32, tag = "4", default = "0")]
    pub bottom_right_padding: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct Vec2i {
    #[prost(int32, tag = "1", default = "0")]
    pub x: i32,
    #[prost(int32, tag = "2", default = "0")]
    pub y: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct Vec4i {
    #[prost(int32, tag = "1", default = "0")]
    pub x: i32,
    #[prost(int32, tag = "2", default = "0")]
    pub y: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub z: i32,
    #[prost(int32, tag = "4", default = "0")]
    pub w: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct KeyValuePairVec2iSingle {
    #[prost(message, optional, tag = "1")]
    pub key: ::core::option::Option<Vec2i>,
    #[prost(float, tag = "2")]
    pub value: f32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct LandClaim {
    #[prost(message, repeated, tag = "1")]
    pub areas: ::prost::alloc::vec::Vec<Cuboidi>,
    #[prost(int32, tag = "2", default = "0")]
    pub protection_level: i32,
    #[prost(int64, tag = "3", default = "0")]
    pub owned_by_entity_id: i64,
    #[prost(string, tag = "4")]
    pub owned_by_player_uid: ::prost::alloc::string::String,
    #[prost(uint32, tag = "5", default = "0")]
    pub owned_by_player_group_uid: u32,
    #[prost(string, tag = "6")]
    pub last_known_owner_name: ::prost::alloc::string::String,
    #[prost(string, tag = "7")]
    pub description: ::prost::alloc::string::String,
    #[prost(map = "int32, int32", tag = "8")]
    pub permitted_player_group_ids: ::std::collections::HashMap<i32, i32>,
    #[prost(map = "string, int32", tag = "9")]
    pub permitted_player_uids: ::std::collections::HashMap<::prost::alloc::string::String, i32>,
    #[prost(map = "string, string", tag = "10")]
    pub permitted_player_last_known_player_name:
        ::std::collections::HashMap<::prost::alloc::string::String, ::prost::alloc::string::String>,
    #[prost(bool, tag = "11", default = "false")]
    pub allow_use_everyone: bool,
    #[prost(bool, tag = "12", default = "false")]
    pub allow_traverse_everyone: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct MapPieceDb {
    #[prost(int32, repeated, packed = "true", tag = "1")]
    pub pixels: ::prost::alloc::vec::Vec<i32>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct PlayerSpawnPos {
    #[prost(int32, tag = "1", default = "0")]
    pub x: i32,
    #[prost(int32, tag = "2")]
    pub y: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub z: i32,
    #[prost(float, tag = "4")]
    pub yaw: f32,
    #[prost(float, tag = "5")]
    pub pitch: f32,
    #[prost(float, tag = "6")]
    pub roll: f32,
    #[prost(int32, tag = "7", default = "0")]
    pub remaining_uses: i32,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct ServerWorldPlayerData {
    #[prost(string, tag = "1")]
    pub player_uid: ::prost::alloc::string::String,
    #[prost(map = "string, bytes", tag = "2")]
    pub inventories_serialized:
        ::std::collections::HashMap<::prost::alloc::string::String, ::prost::alloc::vec::Vec<u8>>,
    #[prost(bytes, tag = "3")]
    pub entity_player_serialized: ::prost::alloc::vec::Vec<u8>,
    #[prost(enumeration = "EnumGameMode", tag = "4")]
    pub game_mode: i32,
    #[prost(float, tag = "5", default = "0")]
    pub move_speed_multiplier: f32,
    #[prost(bool, tag = "6", default = "false")]
    pub free_move: bool,
    #[prost(bool, tag = "7", default = "false")]
    pub no_clip: bool,
    #[prost(int32, tag = "8", default = "0")]
    pub viewdistance: i32,
    #[prost(int32, tag = "9", default = "0")]
    pub selected_hotbarslot: i32,
    #[prost(enumeration = "EnumFreeMovAxisLock", tag = "10")]
    pub free_move_plane_lock: i32,
    #[prost(float, tag = "11", default = "0")]
    pub picking_range: f32,
    #[prost(bool, tag = "12", default = "false")]
    pub area_selection_mode: bool,
    #[prost(bool, tag = "13", default = "false")]
    pub did_select_skin: bool,
    #[prost(message, optional, tag = "14")]
    pub spawn_position: ::core::option::Option<PlayerSpawnPos>,
    #[prost(map = "string, bytes", tag = "15")]
    pub mod_data:
        ::std::collections::HashMap<::prost::alloc::string::String, ::prost::alloc::vec::Vec<u8>>,
    #[prost(float, tag = "16", default = "0")]
    pub previous_picking_range: f32,
    #[prost(int32, tag = "17", default = "0")]
    pub deaths: i32,
    #[prost(bool, tag = "18", default = "false")]
    pub render_meta_blocks: bool,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct GameData {
    #[prost(int32, tag = "1", default = "0")]
    pub map_size_x: i32,
    #[prost(int32, tag = "2", default = "0")]
    pub map_size_y: i32,
    #[prost(int32, tag = "3", default = "0")]
    pub map_size_z: i32,
    #[prost(map = "string, message", tag = "4")]
    pub player_data_by_uid:
        ::std::collections::HashMap<::prost::alloc::string::String, ServerWorldPlayerData>,
    #[prost(int32, tag = "7", default = "0")]
    pub seed: i32,
    #[prost(int64, tag = "8", default = "0")]
    pub simulation_current_frame: i64,
    #[prost(int64, tag = "10", default = "0")]
    pub last_entity_id: i64,
    #[prost(map = "string, bytes", tag = "11")]
    pub mod_data:
        ::std::collections::HashMap<::prost::alloc::string::String, ::prost::alloc::vec::Vec<u8>>,
    #[prost(int64, tag = "12")]
    pub total_game_seconds: i64,
    #[prost(string, tag = "13")]
    pub world_name: ::prost::alloc::string::String,
    #[prost(int32, tag = "14")]
    pub total_seconds_played: i32,
    #[prost(enumeration = "EnumPlayStyle", tag = "16")]
    pub world_play_style: i32,
    #[prost(string, tag = "17", optional)]
    pub last_played: Option<::prost::alloc::string::String>,
    #[prost(string, tag = "18")]
    pub created_game_version: ::prost::alloc::string::String,
    #[prost(int32, tag = "19", default = "0")]
    pub game_time_speed: i32,
    #[prost(int32, tag = "20", default = "0")]
    pub mini_dimensions_created: i32,
    #[prost(string, tag = "21")]
    pub last_saved_game_version: ::prost::alloc::string::String,
    #[prost(string, tag = "22")]
    pub created_by_player_name: ::prost::alloc::string::String,
    #[prost(bool, tag = "23", default = "false")]
    pub entity_spawning: bool,
    #[prost(float, tag = "25", default = "0")]
    pub hours_per_day: f32,
    #[prost(int64, tag = "26", default = "0")]
    pub last_herd_id: i64,
    #[prost(message, repeated, tag = "27")]
    pub land_claims: ::prost::alloc::vec::Vec<LandClaim>,
    #[prost(map = "string, float", tag = "28")]
    pub time_speed_modifiers: ::std::collections::HashMap<::prost::alloc::string::String, f32>,
    #[prost(string, tag = "29")]
    pub play_style: ::prost::alloc::string::String,
    #[prost(string, tag = "30")]
    pub world_type: ::prost::alloc::string::String,
    #[prost(bytes, tag = "31")]
    pub world_config_bytes: ::prost::alloc::vec::Vec<u8>,
    #[prost(string, tag = "32")]
    pub play_style_lang_code: ::prost::alloc::string::String,
    #[prost(int32, tag = "33", default = "0")]
    pub last_block_item_mapping_version: i32,
    #[prost(string, tag = "34")]
    pub savegame_identifier: ::prost::alloc::string::String,
    #[prost(float, tag = "35", default = "0")]
    pub calendar_speed_mul: f32,
    #[prost(map = "string, bool", tag = "36")]
    pub remappings_applied_by_code:
        ::std::collections::HashMap<::prost::alloc::string::String, bool>,
    #[prost(int32, tag = "37", default = "0")]
    pub highest_chunkdata_version: i32,
    #[prost(int64, tag = "38")]
    pub total_game_seconds_start: i64,
    #[prost(int32, tag = "39", default = "0")]
    pub created_world_gen_version: i32,
    #[prost(message, optional, tag = "40")]
    pub default_spawn: ::core::option::Option<PlayerSpawnPos>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct MapMarkers {
    #[prost(message, repeated, tag = "1")]
    pub markers: ::prost::alloc::vec::Vec<MapMarker>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct MapMarkerPos {
    #[prost(double, tag = "1")]
    pub x: f64,
    #[prost(double, tag = "2")]
    pub z: f64,
    #[prost(double, tag = "3")]
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct MapMarker {
    #[prost(uint32, tag = "1")]
    pub color: u32,
    #[prost(string, tag = "2")]
    pub icon: ::prost::alloc::string::String,
    #[prost(uint64, tag = "3")]
    pub opacity: u64,
    #[prost(string, tag = "4")]
    pub player_uid: ::prost::alloc::string::String,
    #[prost(uint64, tag = "5", optional)]
    pub number: ::core::option::Option<u64>,
    #[prost(message, optional, tag = "6")]
    pub position: ::core::option::Option<MapMarkerPos>,
    #[prost(string, tag = "10")]
    pub label: ::prost::alloc::string::String,
    #[prost(string, tag = "11")]
    pub id: ::prost::alloc::string::String,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct ProspectReading {
    #[prost(double, tag = "2")]
    pub depth: f64,
    #[prost(double, tag = "3")]
    pub quality: f64,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct ProspectingResult {
    #[prost(string, tag = "1")]
    pub ore_code: ::prost::alloc::string::String,
    #[prost(message, optional, tag = "2")]
    pub readings: ::core::option::Option<ProspectReading>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct ProspectMarker {
    #[prost(message, optional, tag = "1")]
    pub position: ::core::option::Option<MapMarkerPos>,
    #[prost(message, repeated, tag = "2")]
    pub results: ::prost::alloc::vec::Vec<ProspectingResult>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct ProspectingLog {
    #[prost(message, repeated, tag = "1")]
    pub markers: ::prost::alloc::vec::Vec<ProspectMarker>,
}
