export type TaskStatus =
  | "active"
  | "waiting"
  | "paused"
  | "stopped"
  | "complete"
  | "error";

export interface Task {
  id: string;
  aria2_gid: string | null;
  source_uri: string;
  display_name: string;
  destination_path: string;
  status: TaskStatus;
  progress_percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  download_speed_bps: number;
  upload_speed_bps: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  uploaded_bytes: number;
  orphan_imported: boolean;
  error_message: string | null;
  is_torrent: boolean;
  torrent_info_hash: string | null;
  selected_files: string[] | null;
  queue_position?: number;
}

export interface TorrentFile {
  index: number;
  path: string;
  bytes: number;
  completed_bytes: number;
  selected: boolean;
}

export interface TorrentMetadata {
  info_hash: string;
  name: string;
  total_bytes: number;
  files: TorrentFile[];
  trackers: string[];
  peers: number;
  seeders: number;
}

export type EngineProcessState =
  | "running"
  | "restarting"
  | "stopped"
  | "crashed"
  | "engine_failed";

export interface Engine {
  process_state: EngineProcessState;
  restart_attempts_in_current_burst: number;
  last_error_message: string | null;
  rpc_host: string;
  rpc_port: number;
  config_path: string;
  session_path: string;
  session_save_interval_seconds: number;
  file_allocation: string;
}

export type ThemePreference = "system" | "light" | "dark";
export type FileCollisionBehavior = "rename" | "overwrite" | "skip";
export type FileAllocationMethod = "falloc" | "none" | "prealloc" | "trunc";

export interface Settings {
  download_directory: string;
  max_concurrent_downloads: number;
  max_connections_per_task: number;
  global_download_limit_bps: number | null;
  global_upload_limit_bps: number | null;
  auto_update_trackers: boolean;
  dht_enabled: boolean;
  pex_enabled: boolean;
  close_to_tray: boolean;
  auto_start_on_boot: boolean;
  auto_start_paused_at_startup: boolean;
  duplicate_url_warning: boolean;
  file_collision_behavior: FileCollisionBehavior;
  theme_preference: ThemePreference;
  seed_ratio_target: number;
  file_allocation_method: FileAllocationMethod;
  max_tries: number;
  retry_wait_seconds: number;
  notifications_enabled: boolean;
}

export interface UpdateInfo {
  version: string;
  current_version: string;
  notes: string | null;
  pub_date: string | null;
}

export interface UpdateCheckResult {
  available: boolean;
  update: UpdateInfo | null;
}

export interface UpdateDownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

export interface TrackerListRefreshResult {
  fetched_at: string;
  tracker_count: number;
}
