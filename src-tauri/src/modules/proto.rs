use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, PartialEq, ::prost::Message)]
pub struct GameData {
    #[prost(int32, tag = "7", default = "0")]
    pub seed: i32,
    #[prost(int64, tag = "12")]
    pub total_game_seconds: i64,
    #[prost(string, tag = "13")]
    pub world_name: ::prost::alloc::string::String,
    #[prost(int32, tag = "14")]
    pub total_seconds_played: i32,
    #[prost(string, tag = "17", optional)]
    pub last_played: Option<::prost::alloc::string::String>,
    #[prost(string, tag = "18")]
    pub created_game_version: ::prost::alloc::string::String,
    #[prost(string, tag = "21")]
    pub last_saved_game_version: ::prost::alloc::string::String,
    #[prost(string, tag = "22")]
    pub created_by_player_name: ::prost::alloc::string::String,
    #[prost(string, tag = "29")]
    pub play_style: ::prost::alloc::string::String,
    #[prost(string, tag = "30")]
    pub world_type: ::prost::alloc::string::String,
    #[prost(string, tag = "34")]
    pub savegame_identifier: ::prost::alloc::string::String,
    #[prost(int64, tag = "38")]
    pub total_game_seconds_start: i64,
}