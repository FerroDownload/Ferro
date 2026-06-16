import type {
  Engine,
  EngineProcessState,
  FileAllocationMethod,
  FileCollisionBehavior,
  Settings,
  Task,
  TaskStatus,
  ThemePreference,
  TorrentFile,
  TorrentMetadata,
} from "./types";

export const TASK_STATUSES = [
  "active",
  "waiting",
  "paused",
  "stopped",
  "complete",
  "error",
] as const satisfies readonly TaskStatus[];

export const ENGINE_PROCESS_STATES = [
  "running",
  "restarting",
  "stopped",
  "crashed",
  "engine_failed",
] as const satisfies readonly EngineProcessState[];

export const FILE_COLLISION_BEHAVIORS = [
  "rename",
  "overwrite",
  "skip",
] as const satisfies readonly FileCollisionBehavior[];

export const FILE_ALLOCATION_METHODS = [
  "falloc",
  "none",
  "prealloc",
  "trunc",
] as const satisfies readonly FileAllocationMethod[];

export const THEME_PREFERENCES = [
  "system",
  "light",
  "dark",
] as const satisfies readonly ThemePreference[];

type UnknownRecord = Record<string, unknown>;

const expectRecord = (value: unknown, label: string): UnknownRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as UnknownRecord;
};

const expectString = (value: unknown, label: string): string => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
};

const expectBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
};

const expectNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }

  return value;
};

const expectNullableString = (value: unknown, label: string): string | null => {
  if (value === null) {
    return value;
  }

  return expectString(value, label);
};

const expectStringArray = (value: unknown, label: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${label} must be an array of strings`);
  }

  return value;
};

const expectNullableStringArray = (
  value: unknown,
  label: string,
): string[] | null => {
  if (value === null) {
    return value;
  }

  return expectStringArray(value, label);
};

const expectEnumValue = <T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T => {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error(`${label} must be a valid ${label.split(".").pop()}`);
  }

  return value as T;
};

export function parseTask(value: unknown): Task {
  const entry = expectRecord(value, "Task response");

  return {
    id: expectString(entry.id, "Task.id"),
    aria2_gid:
      entry.aria2_gid === null
        ? null
        : expectString(entry.aria2_gid, "Task.aria2_gid"),
    source_uri: expectString(entry.source_uri, "Task.source_uri"),
    display_name: expectString(entry.display_name, "Task.display_name"),
    destination_path: expectString(
      entry.destination_path,
      "Task.destination_path",
    ),
    status: expectEnumValue(entry.status, TASK_STATUSES, "Task.status"),
    progress_percent: expectNumber(
      entry.progress_percent,
      "Task.progress_percent",
    ),
    downloaded_bytes: expectNumber(
      entry.downloaded_bytes,
      "Task.downloaded_bytes",
    ),
    total_bytes: expectNumber(entry.total_bytes, "Task.total_bytes"),
    download_speed_bps: expectNumber(
      entry.download_speed_bps,
      "Task.download_speed_bps",
    ),
    upload_speed_bps: expectNumber(
      entry.upload_speed_bps,
      "Task.upload_speed_bps",
    ),
    created_at: expectString(entry.created_at, "Task.created_at"),
    updated_at: expectString(entry.updated_at, "Task.updated_at"),
    completed_at: expectNullableString(entry.completed_at, "Task.completed_at"),
    uploaded_bytes: expectNumber(entry.uploaded_bytes, "Task.uploaded_bytes"),
    orphan_imported: expectBoolean(
      entry.orphan_imported,
      "Task.orphan_imported",
    ),
    error_message: expectNullableString(
      entry.error_message,
      "Task.error_message",
    ),
    is_torrent: expectBoolean(entry.is_torrent, "Task.is_torrent"),
    torrent_info_hash: expectNullableString(
      entry.torrent_info_hash,
      "Task.torrent_info_hash",
    ),
    selected_files: expectNullableStringArray(
      entry.selected_files,
      "Task.selected_files",
    ),
  };
}

export function parseTaskList(value: unknown): Task[] {
  if (!Array.isArray(value)) {
    throw new Error("Task list response must be an array");
  }

  return value.map(parseTask);
}

export function parseTorrentFile(value: unknown): TorrentFile {
  const entry = expectRecord(value, "Torrent file response");

  return {
    index: expectNumber(entry.index, "TorrentFile.index"),
    path: expectString(entry.path, "TorrentFile.path"),
    bytes: expectNumber(entry.bytes, "TorrentFile.bytes"),
    completed_bytes: expectNumber(
      entry.completed_bytes,
      "TorrentFile.completed_bytes",
    ),
    selected: expectBoolean(entry.selected, "TorrentFile.selected"),
  };
}

export function parseTorrentMetadata(value: unknown): TorrentMetadata {
  const entry = expectRecord(value, "Torrent metadata response");
  if (!Array.isArray(entry.files)) {
    throw new Error("TorrentMetadata.files must be an array");
  }

  return {
    info_hash: expectString(entry.info_hash, "TorrentMetadata.info_hash"),
    name: expectString(entry.name, "TorrentMetadata.name"),
    total_bytes: expectNumber(entry.total_bytes, "TorrentMetadata.total_bytes"),
    files: entry.files.map(parseTorrentFile),
    trackers: expectStringArray(entry.trackers, "TorrentMetadata.trackers"),
    peers: expectNumber(entry.peers, "TorrentMetadata.peers"),
    seeders: expectNumber(entry.seeders, "TorrentMetadata.seeders"),
  };
}

export function parseEngineStatus(value: unknown): Engine {
  const entry = expectRecord(value, "Engine response");

  return {
    process_state: expectEnumValue(
      entry.process_state,
      ENGINE_PROCESS_STATES,
      "Engine.process_state",
    ),
    restart_attempts_in_current_burst: expectNumber(
      entry.restart_attempts_in_current_burst,
      "Engine.restart_attempts_in_current_burst",
    ),
    last_error_message: expectNullableString(
      entry.last_error_message,
      "Engine.last_error_message",
    ),
    rpc_host: expectString(entry.rpc_host, "Engine.rpc_host"),
    rpc_port: expectNumber(entry.rpc_port, "Engine.rpc_port"),
    config_path: expectString(entry.config_path, "Engine.config_path"),
    session_path: expectString(entry.session_path, "Engine.session_path"),
    session_save_interval_seconds: expectNumber(
      entry.session_save_interval_seconds,
      "Engine.session_save_interval_seconds",
    ),
    file_allocation: expectString(
      entry.file_allocation,
      "Engine.file_allocation",
    ),
  };
}

export function parseSettings(value: unknown): Settings {
  const entry = expectRecord(value, "Settings response");

  return {
    download_directory: expectString(
      entry.download_directory,
      "Settings.download_directory",
    ),
    max_concurrent_downloads: expectNumber(
      entry.max_concurrent_downloads,
      "Settings.max_concurrent_downloads",
    ),
    max_connections_per_task: expectNumber(
      entry.max_connections_per_task,
      "Settings.max_connections_per_task",
    ),
    global_download_limit_bps:
      entry.global_download_limit_bps === null
        ? null
        : expectNumber(
            entry.global_download_limit_bps,
            "Settings.global_download_limit_bps",
          ),
    global_upload_limit_bps:
      entry.global_upload_limit_bps === null
        ? null
        : expectNumber(
            entry.global_upload_limit_bps,
            "Settings.global_upload_limit_bps",
          ),
    auto_update_trackers: expectBoolean(
      entry.auto_update_trackers,
      "Settings.auto_update_trackers",
    ),
    dht_enabled: expectBoolean(entry.dht_enabled, "Settings.dht_enabled"),
    pex_enabled: expectBoolean(entry.pex_enabled, "Settings.pex_enabled"),
    close_to_tray: expectBoolean(entry.close_to_tray, "Settings.close_to_tray"),
    auto_start_on_boot: expectBoolean(
      entry.auto_start_on_boot,
      "Settings.auto_start_on_boot",
    ),
    auto_start_paused_at_startup: expectBoolean(
      entry.auto_start_paused_at_startup,
      "Settings.auto_start_paused_at_startup",
    ),
    duplicate_url_warning: expectBoolean(
      entry.duplicate_url_warning,
      "Settings.duplicate_url_warning",
    ),
    file_collision_behavior: expectEnumValue(
      entry.file_collision_behavior,
      FILE_COLLISION_BEHAVIORS,
      "Settings.file_collision_behavior",
    ),
    theme_preference: expectEnumValue(
      entry.theme_preference,
      THEME_PREFERENCES,
      "Settings.theme_preference",
    ),
    seed_ratio_target: expectNumber(
      entry.seed_ratio_target,
      "Settings.seed_ratio_target",
    ),
    file_allocation_method: expectEnumValue(
      entry.file_allocation_method,
      FILE_ALLOCATION_METHODS,
      "Settings.file_allocation_method",
    ),
    max_tries: expectNumber(entry.max_tries, "Settings.max_tries"),
    retry_wait_seconds: expectNumber(
      entry.retry_wait_seconds,
      "Settings.retry_wait_seconds",
    ),
    notifications_enabled: expectBoolean(
      entry.notifications_enabled,
      "Settings.notifications_enabled",
    ),
  };
}
