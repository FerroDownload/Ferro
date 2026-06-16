import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { RouterProvider } from "react-router";
import { beforeEach, vi } from "vitest";

import { createAppRouter } from "../../src/app/routes";

const { fetchTorrentMetadata } = vi.hoisted(() => ({
  fetchTorrentMetadata: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../../src/features/tasks/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: [],
    activeTasks: [],
    historyTasks: [],
    searchQuery: "",
    setSearchQuery: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("@/features/engine/hooks/useEngineStatus", () => ({
  useEngineStatus: () => ({
    engine: {
      process_state: "running",
      restart_attempts_in_current_burst: 0,
      last_error_message: null,
      rpc_host: "127.0.0.1",
      rpc_port: 16800,
      config_path: "C:/ferro/aria2.conf",
      session_path: "C:/ferro/aria2.session",
      session_save_interval_seconds: 60,
      file_allocation: "falloc",
    },
    error: null,
    mutationsAllowed: true,
  }),
}));

vi.mock("../../src/features/settings/hooks/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (state: {
      settings: {
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
        file_collision_behavior: "rename";
        theme_preference: "system";
        seed_ratio_target: number;
        file_allocation_method: "falloc";
        max_tries: number;
        retry_wait_seconds: number;
        notifications_enabled: boolean;
      };
      isLoading: boolean;
      error: string | null;
      loadSettings: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      settings: {
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
      },
      isLoading: false,
      error: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock("../../src/features/tasks/services/taskCommands", () => ({
  addTask: vi.fn().mockResolvedValue(undefined),
  addTorrentTask: vi.fn().mockResolvedValue(undefined),
  triggerRestartRecovery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/features/tasks/services/torrentCommands", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/features/tasks/services/torrentCommands")
  >("../../src/features/tasks/services/torrentCommands");

  return {
    ...actual,
    fetchTorrentMetadata,
  };
});

// Ref: https://github.com/testing-library/react-testing-library/blob/main/README.md

describe("Task list integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(open).mockResolvedValue(null);
    fetchTorrentMetadata.mockResolvedValue({
      info_hash: "abcd",
      name: "Example Torrent",
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
      trackers: [],
      peers: 0,
      seeders: 0,
    });
  });

  it("shows empty state on downloads route", () => {
    render(<RouterProvider router={createAppRouter(["/"])} />);

    expect(
      screen.getByRole("heading", { name: /no downloads/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/url \/ magnet \/ torrent/i)).toBeInTheDocument();
  });

  it("opens torrent file selection from the add download dialog", async () => {
    vi.mocked(open).mockResolvedValueOnce(
      "C:/Users/Test/Downloads/example.torrent",
    );
    const user = userEvent.setup();

    render(<RouterProvider router={createAppRouter(["/"])} />);

    await user.click(screen.getByRole("button", { name: /new download/i }));
    await user.click(
      screen.getByRole("button", { name: /browse torrent file/i }),
    );

    expect(fetchTorrentMetadata).toHaveBeenCalledWith({
      torrentPath: "C:/Users/Test/Downloads/example.torrent",
    });
    expect(
      await screen.findByRole("heading", { name: /select files to download/i }),
    ).toBeInTheDocument();
  });
});
