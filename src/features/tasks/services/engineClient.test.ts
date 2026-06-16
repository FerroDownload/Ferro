import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/tauri", () => ({
  invokeEngineStart: vi.fn(),
  invokeEngineStatus: vi.fn(),
  invokeListTasks: vi.fn(),
}));

import {
  invokeEngineStart,
  invokeEngineStatus,
  invokeListTasks,
} from "@/shared/lib/tauri";

import { fetchEngineStatus, fetchTasks, startEngine } from "./engineClient";

describe("engineClient", () => {
  it("returns a validated engine status payload", async () => {
    vi.mocked(invokeEngineStatus).mockResolvedValue({
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

    await expect(fetchEngineStatus()).resolves.toMatchObject({
      process_state: "running",
      rpc_port: 16800,
    });
  });

  it("returns a validated engine status after starting the engine", async () => {
    vi.mocked(invokeEngineStart).mockResolvedValue({
      process_state: "running",
      restart_attempts_in_current_burst: 0,
      last_error_message: null,
      rpc_host: "127.0.0.1",
      rpc_port: 16801,
      config_path: "C:/Ferro/aria2.conf",
      session_path: "C:/Ferro/aria2.session",
      session_save_interval_seconds: 60,
      file_allocation: "falloc",
    });

    await expect(startEngine()).resolves.toMatchObject({
      process_state: "running",
      rpc_port: 16801,
    });
  });

  it("rejects malformed task payloads", async () => {
    vi.mocked(invokeListTasks).mockResolvedValue([
      {
        id: "task-1",
        aria2_gid: null,
        source_uri: "https://example.org/file",
        display_name: "file",
        destination_path: "C:/Users/Test/Downloads/file",
        status: "invalid",
      } as unknown,
    ] as never);

    await expect(fetchTasks()).rejects.toThrow(/task\.status/i);
  });
});
