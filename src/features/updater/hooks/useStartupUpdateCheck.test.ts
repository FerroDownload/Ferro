import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { invokeUpdaterCheck } from "@/shared/lib/tauri";
import type { Engine } from "@/shared/lib/types";
import { useStartupUpdateCheck } from "./useStartupUpdateCheck";

vi.mock("@/shared/lib/tauri", () => ({
  invokeUpdaterCheck: vi.fn(),
}));

const createEngine = (process_state: Engine["process_state"]): Engine => ({
  process_state,
  restart_attempts_in_current_burst: 0,
  last_error_message: null,
  rpc_host: "127.0.0.1",
  rpc_port: process_state === "running" ? 16800 : 0,
  config_path: "C:/ferro/aria2.conf",
  session_path: "C:/ferro/aria2.session",
  session_save_interval_seconds: 60,
  file_allocation: "falloc",
});

describe("useStartupUpdateCheck", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("checks for updates once after the engine becomes healthy", async () => {
    vi.mocked(invokeUpdaterCheck).mockResolvedValue({
      available: false,
      update: null,
    });

    const { rerender } = renderHook(
      ({ engine }) => useStartupUpdateCheck(engine),
      { initialProps: { engine: null as Engine | null } },
    );

    expect(invokeUpdaterCheck).not.toHaveBeenCalled();

    rerender({ engine: createEngine("restarting") });
    expect(invokeUpdaterCheck).not.toHaveBeenCalled();

    rerender({ engine: createEngine("running") });

    await waitFor(() => expect(invokeUpdaterCheck).toHaveBeenCalledTimes(1));

    rerender({ engine: createEngine("running") });
    expect(invokeUpdaterCheck).toHaveBeenCalledTimes(1);
  });

  it("does not retry automatically when the startup check fails", async () => {
    vi.mocked(invokeUpdaterCheck).mockRejectedValue(new Error("offline"));

    const { rerender } = renderHook(
      ({ engine }) => useStartupUpdateCheck(engine),
      { initialProps: { engine: createEngine("running") } },
    );

    await waitFor(() => expect(invokeUpdaterCheck).toHaveBeenCalledTimes(1));

    rerender({ engine: createEngine("running") });
    expect(invokeUpdaterCheck).toHaveBeenCalledTimes(1);
  });
});
