use serde::{Deserialize, Serialize};

// Ref: https://docs.rs/serde/latest/serde/ser/trait.Serializer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Active,
    Waiting,
    Paused,
    Stopped,
    Complete,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: String,
    pub aria2_gid: Option<String>,
    pub source_uri: String,
    pub display_name: String,
    pub destination_path: String,
    pub status: TaskStatus,
    pub progress_percent: f64,
    pub downloaded_bytes: i64,
    pub total_bytes: i64,
    pub download_speed_bps: i64,
    pub upload_speed_bps: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub uploaded_bytes: i64,
    pub orphan_imported: bool,
    pub error_message: Option<String>,
    pub is_torrent: bool,
    pub torrent_info_hash: Option<String>,
    pub selected_files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TorrentFile {
    pub index: u32,
    pub path: String,
    pub bytes: i64,
    pub completed_bytes: i64,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TorrentMetadata {
    pub info_hash: String,
    pub name: String,
    pub total_bytes: i64,
    pub files: Vec<TorrentFile>,
    pub trackers: Vec<String>,
    pub peers: i64,
    pub seeders: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineProcessState {
    Running,
    Restarting,
    Stopped,
    Crashed,
    EngineFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Engine {
    pub process_state: EngineProcessState,
    pub restart_attempts_in_current_burst: u8,
    pub last_error_message: Option<String>,
    pub rpc_host: String,
    pub rpc_port: u16,
    pub config_path: String,
    pub session_path: String,
    pub session_save_interval_seconds: u64,
    pub file_allocation: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileCollisionBehavior {
    Rename,
    Overwrite,
    Skip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileAllocationMethod {
    Falloc,
    None,
    Prealloc,
    Trunc,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    pub download_directory: String,
    pub max_concurrent_downloads: u32,
    pub max_connections_per_task: u32,
    pub global_download_limit_bps: Option<i64>,
    pub global_upload_limit_bps: Option<i64>,
    pub auto_update_trackers: bool,
    pub dht_enabled: bool,
    pub pex_enabled: bool,
    pub close_to_tray: bool,
    pub auto_start_on_boot: bool,
    pub auto_start_paused_at_startup: bool,
    pub duplicate_url_warning: bool,
    pub file_collision_behavior: FileCollisionBehavior,
    pub theme_preference: ThemePreference,
    pub seed_ratio_target: f64,
    pub file_allocation_method: FileAllocationMethod,
    pub max_tries: u32,
    pub retry_wait_seconds: u32,
    pub notifications_enabled: bool,
}
