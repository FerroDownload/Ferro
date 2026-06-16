import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Engine } from "@/shared/lib/types";
import { EngineFailedView } from "./EngineFailedView";

const createEngine = (overrides: Partial<Engine> = {}): Engine => ({
  process_state: "engine_failed",
  restart_attempts_in_current_burst: 3,
  last_error_message: "aria2.getVersion health check timed out",
  rpc_host: "127.0.0.1",
  rpc_port: 0,
  config_path: "C:/Users/Test/AppData/Roaming/Ferro/aria2.conf",
  session_path: "C:/Users/Test/AppData/Roaming/Ferro/aria2.session",
  session_save_interval_seconds: 60,
  file_allocation: "falloc",
  ...overrides,
});

describe("EngineFailedView", () => {
  it("renders the persistent engine failure message and last error detail", () => {
    render(
      <EngineFailedView
        engine={createEngine()}
        onRetry={vi.fn()}
        onOpenLogsFolder={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /download engine failed to start after 3 attempts/i,
    );
    expect(screen.getByText(/health check timed out/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Open logs folder" }),
    ).toBeEnabled();
  });

  it("calls the retry and open logs actions from the view", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const onOpenLogsFolder = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <EngineFailedView
        engine={createEngine()}
        onRetry={onRetry}
        onOpenLogsFolder={onOpenLogsFolder}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Open logs folder" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onOpenLogsFolder).toHaveBeenCalledTimes(1);
  });

  it("renders nothing outside the terminal failed state", () => {
    const { container } = render(
      <EngineFailedView
        engine={createEngine({ process_state: "restarting" })}
        onRetry={vi.fn()}
        onOpenLogsFolder={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
