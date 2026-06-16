import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Engine } from "@/shared/lib/types";
import {
  fetchEngineStatus,
  startEngine,
} from "@/features/tasks/services/engineClient";
import {
  ENGINE_POLL_INTERVAL_MS,
  ENGINE_RESTARTING_POLL_INTERVAL_MS,
  useEngineStatus,
} from "./useEngineStatus";

vi.mock("@/features/tasks/services/engineClient", () => ({
  fetchEngineStatus: vi.fn(),
  startEngine: vi.fn(),
}));

const createEngine = (process_state: Engine["process_state"]): Engine => ({
  process_state,
  restart_attempts_in_current_burst: process_state === "restarting" ? 1 : 0,
  last_error_message: null,
  rpc_host: "127.0.0.1",
  rpc_port: 16800,
  config_path: "C:/ferro/aria2.conf",
  session_path: "C:/ferro/aria2.session",
  session_save_interval_seconds: 60,
  file_allocation: "falloc",
});

describe("useEngineStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("backs off polling while the engine is restarting", async () => {
    vi.mocked(fetchEngineStatus)
      .mockResolvedValueOnce(createEngine("restarting"))
      .mockResolvedValueOnce(createEngine("running"));

    const { result } = renderHook(() => useEngineStatus());
    await act(async () => {});
    expect(result.current.engine?.process_state).toBe("restarting");

    await vi.advanceTimersByTimeAsync(ENGINE_POLL_INTERVAL_MS);
    expect(fetchEngineStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        ENGINE_RESTARTING_POLL_INTERVAL_MS - ENGINE_POLL_INTERVAL_MS,
      );
    });
    expect(result.current.engine?.process_state).toBe("running");
    expect(fetchEngineStatus).toHaveBeenCalledTimes(2);
  });

  it("starts the download engine when the app opens with a stopped engine", async () => {
    vi.mocked(fetchEngineStatus).mockResolvedValueOnce(createEngine("stopped"));
    vi.mocked(startEngine).mockResolvedValueOnce(createEngine("running"));

    const { result } = renderHook(() => useEngineStatus());
    await act(async () => {});

    expect(startEngine).toHaveBeenCalledTimes(1);
    expect(result.current.engine?.process_state).toBe("running");
  });
});
