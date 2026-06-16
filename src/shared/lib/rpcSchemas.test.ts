import { describe, expect, it } from "vitest";

import {
  parseEngineStatus,
  parseTask,
  parseTaskList,
  parseTorrentMetadata,
} from "./rpcSchemas";

describe("rpcSchemas", () => {
  it("parses engine status", () => {
    const result = parseEngineStatus({
      process_state: "running",
      restart_attempts_in_current_burst: 0,
      last_error_message: null,
      rpc_host: "127.0.0.1",
      rpc_port: 16800,
      config_path: "C:/Ferro/aria2.conf",
      session_path: "C:/Ferro/aria2.session",
      session_save_interval_seconds: 60,
      file_allocation: "falloc",
    });

    expect(result.rpc_port).toBe(16800);
  });

  it("rejects invalid engine status", () => {
    expect(() =>
      parseEngineStatus({
        process_state: "paused",
        restart_attempts_in_current_burst: 0,
        last_error_message: null,
        rpc_host: "127.0.0.1",
        rpc_port: 16800,
        config_path: "C:/Ferro/aria2.conf",
        session_path: "C:/Ferro/aria2.session",
        session_save_interval_seconds: 60,
        file_allocation: "falloc",
      }),
    ).toThrow();
  });

  it("parses task", () => {
    const result = parseTask({
      id: "task-1",
      aria2_gid: null,
      source_uri: "https://example.org/file",
      display_name: "file",
      destination_path: "C:/Users/Test/Downloads/file",
      status: "waiting",
      progress_percent: 0,
      downloaded_bytes: 0,
      total_bytes: 100,
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
    });

    expect(result.status).toBe("waiting");
  });

  it("parses task lists", () => {
    const result = parseTaskList([
      {
        id: "task-1",
        aria2_gid: null,
        source_uri: "https://example.org/file",
        display_name: "file",
        destination_path: "C:/Users/Test/Downloads/file",
        status: "waiting",
        progress_percent: 0,
        downloaded_bytes: 0,
        total_bytes: 100,
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
      },
    ]);

    expect(result).toHaveLength(1);
  });

  it("parses torrent metadata", () => {
    const result = parseTorrentMetadata({
      info_hash: "abcd",
      name: "Example",
      total_bytes: 1024,
      files: [
        {
          index: 1,
          path: "Example/file.bin",
          bytes: 1024,
          completed_bytes: 0,
          selected: true,
        },
      ],
      trackers: ["udp://tracker"],
      peers: 2,
      seeders: 1,
    });

    expect(result.files[0]?.path).toBe("Example/file.bin");
  });
});
