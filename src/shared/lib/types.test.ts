import { describe, expect, it } from "vitest";

import type { Engine, Settings, Task } from "./types";

describe("shared types", () => {
  it("accepts a task shape", () => {
    const task: Task = {
      id: "task-1",
      aria2_gid: null,
      source_uri: "https://example.com/file.iso",
      display_name: "file.iso",
      destination_path: "C:/Users/Test/Downloads/file.iso",
      status: "waiting",
      progress_percent: 0,
      downloaded_bytes: 0,
      total_bytes: 1024,
      download_speed_bps: 0,
      upload_speed_bps: 0,
      created_at: "2026-02-04T00:00:00Z",
      updated_at: "2026-02-04T00:00:00Z",
      completed_at: null,

      uploaded_bytes: 0,

      orphan_imported: false,
      error_message: null,
      is_torrent: false,
      torrent_info_hash: null,
      selected_files: null,
    };

    expect(task.status).toBe("waiting");
    expect(task.source_uri).toBe("https://example.com/file.iso");
  });

  it("accepts engine and settings shapes", () => {
    const engine: Engine = {
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

    const settings: Settings = {
      download_directory: "C:/Users/Test/Downloads",
      max_concurrent_downloads: 5,
      max_connections_per_task: 16,
      global_download_limit_bps: null,
      global_upload_limit_bps: 1_000_000,
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

    expect(engine.process_state).toBe("running");
    expect(settings.max_connections_per_task).toBe(16);
  });
});
