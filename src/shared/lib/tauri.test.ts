import { describe, expect, it, afterEach } from "vitest";

import {
  invokeEngineOpenLogsFolder,
  invokeEngineRetry,
  invokeEngineStart,
  invokeEngineStatus,
  invokeEngineStop,
  invokeGetSettings,
  invokeLogOpenFolder,
  invokeListTasks,
} from "./tauri";
import { resetTauriMocks, setupTauriMocks } from "./tauriMocks";

afterEach(() => {
  resetTauriMocks();
});

describe("tauri invoke wrappers", () => {
  it("invokes engine commands", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "engine_status") {
        return {
          process_state: "running",
          restart_attempts_in_current_burst: 0,
          last_error_message: null,
          rpc_host: "127.0.0.1",
          rpc_port: 16800,
          config_path: "C:/Ferro/aria2.conf",
          session_path: "C:/Ferro/aria2.session",
          session_save_interval_seconds: 60,
          file_allocation: "falloc",
        };
      }
      if (cmd === "engine_start") {
        return {
          process_state: "running",
          restart_attempts_in_current_burst: 0,
          last_error_message: null,
          rpc_host: "127.0.0.1",
          rpc_port: 16800,
          config_path: "C:/Ferro/aria2.conf",
          session_path: "C:/Ferro/aria2.session",
          session_save_interval_seconds: 60,
          file_allocation: "falloc",
        };
      }
      if (cmd === "engine_stop") {
        return {
          process_state: "stopped",
          restart_attempts_in_current_burst: 0,
          last_error_message: null,
          rpc_host: "127.0.0.1",
          rpc_port: 0,
          config_path: "C:/Ferro/aria2.conf",
          session_path: "C:/Ferro/aria2.session",
          session_save_interval_seconds: 60,
          file_allocation: "falloc",
        };
      }
      if (cmd === "engine_retry") {
        return {
          process_state: "running",
          restart_attempts_in_current_burst: 0,
          last_error_message: null,
          rpc_host: "127.0.0.1",
          rpc_port: 16801,
          config_path: "C:/Ferro/aria2.conf",
          session_path: "C:/Ferro/aria2.session",
          session_save_interval_seconds: 60,
          file_allocation: "falloc",
        };
      }
      return null;
    });

    await expect(invokeEngineStatus()).resolves.toMatchObject({
      process_state: "running",
    });
    await expect(invokeEngineStart()).resolves.toMatchObject({
      process_state: "running",
    });
    await expect(invokeEngineStop()).resolves.toMatchObject({
      process_state: "stopped",
      rpc_port: 0,
    });
    await expect(invokeEngineRetry()).resolves.toMatchObject({
      process_state: "running",
      rpc_port: 16801,
    });
  });

  it("invokes log folder commands", async () => {
    const invoked: string[] = [];
    setupTauriMocks((cmd) => {
      invoked.push(cmd);
      return null;
    });

    await invokeEngineOpenLogsFolder();
    await invokeLogOpenFolder();

    expect(invoked).toEqual(["engine_open_logs_folder", "log_open_folder"]);
  });

  it("invokes list tasks and settings", async () => {
    setupTauriMocks((cmd) => {
      if (cmd === "list_tasks") {
        return [];
      }
      if (cmd === "get_settings") {
        return {
          download_directory: "C:/Users/Test/Downloads",
          max_concurrent_downloads: 5,
          max_connections_per_task: 16,
          global_download_limit_bps: null,
          global_upload_limit_bps: null,
          auto_update_trackers: true,
          dht_enabled: false,
          pex_enabled: false,
          close_to_tray: true,
          auto_start_on_boot: true,
          auto_start_paused_at_startup: false,
          duplicate_url_warning: true,
          file_collision_behavior: "rename",
          theme_preference: "system",
          seed_ratio_target: 1.0,
          file_allocation_method: "falloc",
          max_tries: 5,
          retry_wait_seconds: 0,
          notifications_enabled: true,
        };
      }
      return null;
    });

    await expect(invokeListTasks()).resolves.toEqual([]);
    await expect(invokeGetSettings()).resolves.toMatchObject({
      download_directory: "C:/Users/Test/Downloads",
    });
  });
});
