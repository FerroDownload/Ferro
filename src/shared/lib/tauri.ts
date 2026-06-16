import { invoke } from "@tauri-apps/api/core";

import type {
  Engine,
  Settings,
  Task,
  TrackerListRefreshResult,
  UpdateCheckResult,
} from "./types";

export async function invokeEngineStatus(): Promise<Engine> {
  return invoke("engine_status");
}

export async function invokeEngineStart(): Promise<Engine> {
  return invoke("engine_start");
}

export async function invokeEngineStop(): Promise<Engine> {
  return invoke("engine_stop");
}

export async function invokeEngineRetry(): Promise<Engine> {
  return invoke("engine_retry");
}

export async function invokeEngineOpenLogsFolder(): Promise<void> {
  await invoke("engine_open_logs_folder");
}

export async function invokeLogOpenFolder(): Promise<void> {
  await invoke("log_open_folder");
}

export async function invokeWindowCloseRequested(): Promise<void> {
  await invoke("window_close_requested");
}

export async function invokeUpdaterCheck(): Promise<UpdateCheckResult> {
  return invoke("updater_check");
}

export async function invokeUpdaterDownloadAndInstall(): Promise<void> {
  await invoke("updater_download_and_install");
}

export async function invokeListTasks(): Promise<Task[]> {
  return invoke("list_tasks");
}

export async function invokeGetSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export async function invokeUpdateSettings(
  settings: Settings,
): Promise<Settings> {
  return invoke("update_settings", { settings });
}

export async function invokeRefreshTrackers(): Promise<TrackerListRefreshResult> {
  return invoke("refresh_trackers");
}
