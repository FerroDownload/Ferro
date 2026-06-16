import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { RouterProvider } from "react-router";
import { beforeEach, vi } from "vitest";
import { createAppRouter } from "./routes";
import type { Engine } from "@/shared/lib/types";

const {
  fetchTorrentMetadata,
  registerProtocolListenerMock,
  useEngineStatusMock,
  useTasksMock,
} = vi.hoisted(() => ({
  fetchTorrentMetadata: vi.fn(),
  registerProtocolListenerMock: vi.fn(),
  useEngineStatusMock: vi.fn(),
  useTasksMock: vi.fn(),
}));

let protocolOpenHandler: ((url: string) => void) | null = null;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 72,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: String(i),
        start: i * 72,
        size: 72,
      })),
  }),
}));

vi.mock("@/features/tasks/hooks/useTasks", () => ({
  useTasks: () => useTasksMock(),
}));

vi.mock("@/features/engine/hooks/useEngineStatus", () => ({
  useEngineStatus: useEngineStatusMock,
}));

vi.mock("./protocolListener", () => ({
  registerProtocolListener: registerProtocolListenerMock,
}));

vi.mock("@/features/settings/hooks/useSettingsStore", () => ({
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

vi.mock("@/features/tasks/services/taskCommands", () => ({
  addTask: vi.fn().mockResolvedValue(undefined),
  addTorrentTask: vi.fn().mockResolvedValue(undefined),
  pauseTask: vi.fn().mockResolvedValue(undefined),
  resumeTask: vi.fn().mockResolvedValue(undefined),
  pauseAllTasks: vi.fn().mockResolvedValue(undefined),
  resumeAllTasks: vi.fn().mockResolvedValue(undefined),
  triggerRestartRecovery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/tasks/services/torrentCommands", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/tasks/services/torrentCommands")
  >("@/features/tasks/services/torrentCommands");

  return {
    ...actual,
    fetchTorrentMetadata,
  };
});

const createEngine = (process_state: Engine["process_state"]): Engine => ({
  process_state,
  restart_attempts_in_current_burst: process_state === "restarting" ? 2 : 0,
  last_error_message: null,
  rpc_host: "127.0.0.1",
  rpc_port: 16800,
  config_path: "C:/ferro/aria2.conf",
  session_path: "C:/ferro/aria2.session",
  session_save_interval_seconds: 60,
  file_allocation: "falloc",
});

const createTask = (overrides: Partial<import("@/shared/lib/types").Task>) => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active" as const,
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
  ...overrides,
});

// Ref: https://github.com/testing-library/react-testing-library/blob/main/README.md
describe("App routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    protocolOpenHandler = null;
    registerProtocolListenerMock.mockImplementation(
      (handler: (url: string) => void) => {
        protocolOpenHandler = handler;
        return Promise.resolve(vi.fn());
      },
    );
    useEngineStatusMock.mockReturnValue({
      engine: createEngine("running"),
      error: null,
      mutationsAllowed: true,
    });
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
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

  it("renders downloads on the index route", () => {
    const router = createAppRouter(["/"]);
    render(<RouterProvider router={router} />);

    expect(
      screen.getByRole("heading", { name: /^downloads$/i }),
    ).toBeInTheDocument();
  });

  it("renders history route", () => {
    render(<RouterProvider router={createAppRouter(["/history"])} />);

    expect(
      screen.getByRole("heading", { name: /history/i }),
    ).toBeInTheDocument();
  });

  it("renders settings route", () => {
    render(<RouterProvider router={createAppRouter(["/settings"])} />);

    expect(
      screen.getByRole("heading", { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it("renders an in-app not found view for unknown routes", () => {
    render(<RouterProvider router={createAppRouter(["/missing"])} />);

    expect(
      screen.getByRole("heading", { name: /not found/i }),
    ).toBeInTheDocument();
    const downloadLinks = screen.getAllByRole("link", {
      name: /^downloads$/i,
    });
    expect(downloadLinks[downloadLinks.length - 1]).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("starts torrent metadata flow from the add download dialog", async () => {
    vi.mocked(open).mockResolvedValueOnce(
      "C:/Users/Test/Downloads/example.torrent",
    );
    const user = userEvent.setup();

    const router = createAppRouter(["/"]);
    render(<RouterProvider router={router} />);

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

  it("opens the add download dialog from the empty-state CTA", async () => {
    const user = userEvent.setup();

    const router = createAppRouter(["/"]);
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole("button", { name: /^add download$/i }));

    expect(
      screen.getByRole("heading", { name: /add download/i }),
    ).toBeInTheDocument();
  });

  it("filters active downloads by a per-view local query", async () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({
          id: "task-1",
          display_name: "Quarterly Report.pdf",
          source_uri: "https://cdn.example.com/report.pdf",
        }),
        createTask({
          id: "task-2",
          display_name: "Installer.exe",
          source_uri: "https://downloads.example.com/ferro/installer.exe",
        }),
      ],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    const user = userEvent.setup();

    const router = createAppRouter(["/"]);
    render(<RouterProvider router={router} />);

    await user.type(
      screen.getByRole("searchbox", { name: /search downloads/i }),
      "ferro",
    );

    expect(screen.queryByText("Quarterly Report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Installer.exe")).toBeInTheDocument();
  });

  it("filters active downloads by queue status with a shadcn toggle group", async () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({
          id: "task-1",
          display_name: "Active.iso",
          status: "active",
        }),
        createTask({
          id: "task-2",
          display_name: "Queued.zip",
          status: "waiting",
        }),
        createTask({
          id: "task-3",
          display_name: "Paused.mp4",
          status: "paused",
        }),
      ],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    const user = userEvent.setup();

    render(<RouterProvider router={createAppRouter(["/"])} />);

    await user.click(screen.getByRole("radio", { name: /^paused$/i }));

    expect(screen.queryByText("Active.iso")).not.toBeInTheDocument();
    expect(screen.queryByText("Queued.zip")).not.toBeInTheDocument();
    expect(screen.getByText("Paused.mp4")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^paused$/i })).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  it("summarizes active queue status in the downloads workspace", () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({ id: "task-1", status: "active" }),
        createTask({ id: "task-2", status: "active" }),
        createTask({ id: "task-3", status: "waiting" }),
        createTask({ id: "task-4", status: "paused" }),
      ],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<RouterProvider router={createAppRouter(["/"])} />);

    expect(screen.getByText("2 active")).toBeInTheDocument();
    expect(screen.getByText("1 queued")).toBeInTheDocument();
    expect(screen.getByText("1 paused")).toBeInTheDocument();
  });

  it("organizes downloads into controls, queue, and session details", () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [createTask({ id: "task-1", status: "active" })],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<RouterProvider router={createAppRouter(["/"])} />);

    expect(
      screen.getByRole("group", { name: /queue controls/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /download queue/i }),
    ).toBeInTheDocument();

    const sessionDetails = screen.getByRole("complementary", {
      name: /session details/i,
    });
    expect(sessionDetails).toHaveTextContent("Destination");
    expect(sessionDetails).toHaveTextContent("C:/Users/Test/Downloads");
    expect(sessionDetails).toHaveTextContent("Engine");
    expect(sessionDetails).toHaveTextContent("running");
  });

  it("keeps history as a records view without queue mutation controls", () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [],
      historyTasks: [
        createTask({
          id: "task-1",
          status: "complete",
          progress_percent: 100,
          completed_at: "2026-02-05T00:00:00Z",
        }),
        createTask({
          id: "task-2",
          status: "error",
          completed_at: "2026-02-05T00:00:00Z",
        }),
      ],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<RouterProvider router={createAppRouter(["/history"])} />);

    expect(
      screen.getByRole("region", { name: /history records/i }),
    ).toBeInTheDocument();
    const details = screen.getByRole("complementary", {
      name: /history details/i,
    });
    expect(details).toHaveTextContent("Records");
    expect(details).toHaveTextContent("2");
    expect(details).toHaveTextContent("Complete");
    expect(details).toHaveTextContent("1");
    expect(
      screen.queryByRole("button", { name: /new download/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pause all/i }),
    ).not.toBeInTheDocument();
  });

  it("filters history records by outcome with a shadcn toggle group", async () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [],
      historyTasks: [
        createTask({
          id: "task-1",
          display_name: "Finished.zip",
          status: "complete",
          progress_percent: 100,
          completed_at: "2026-02-05T00:00:00Z",
        }),
        createTask({
          id: "task-2",
          display_name: "Failed.iso",
          status: "error",
          completed_at: "2026-02-05T00:00:00Z",
        }),
      ],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    const user = userEvent.setup();

    render(<RouterProvider router={createAppRouter(["/history"])} />);

    await user.click(screen.getByRole("radio", { name: /^failed$/i }));

    expect(screen.queryByText("Finished.zip")).not.toBeInTheDocument();
    expect(screen.getByText("Failed.iso")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^failed$/i })).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  it("summarizes history outcomes in the history workspace", () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [],
      historyTasks: [
        createTask({
          id: "task-1",
          status: "complete",
          progress_percent: 100,
          completed_at: "2026-02-05T00:00:00Z",
        }),
        createTask({
          id: "task-2",
          status: "stopped",
          completed_at: "2026-02-05T00:00:00Z",
        }),
        createTask({
          id: "task-3",
          status: "error",
          completed_at: "2026-02-05T00:00:00Z",
        }),
      ],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });

    render(<RouterProvider router={createAppRouter(["/history"])} />);

    expect(screen.getByText("1 complete")).toBeInTheDocument();
    expect(screen.getByText("1 cancelled")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
  });

  it("shows a search no-match state without replacing a nonempty view with onboarding", async () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({
          id: "task-1",
          display_name: "Quarterly Report.pdf",
          source_uri: "https://cdn.example.com/report.pdf",
        }),
      ],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    const user = userEvent.setup();

    render(<RouterProvider router={createAppRouter(["/"])} />);

    await user.type(
      screen.getByRole("searchbox", { name: /search downloads/i }),
      "missing.iso",
    );

    expect(
      screen.getByText(/no tasks match "missing\.iso"/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^add download$/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps history search state separate from active search state", async () => {
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({
          id: "task-1",
          display_name: "Installer.exe",
          source_uri: "https://downloads.example.com/ferro/installer.exe",
        }),
      ],
      historyTasks: [
        createTask({
          id: "task-2",
          display_name: "Quarterly Report.pdf",
          source_uri: "https://cdn.example.com/report.pdf",
          status: "complete",
          progress_percent: 100,
          completed_at: "2026-02-05T00:00:00Z",
        }),
      ],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    const user = userEvent.setup();
    render(<RouterProvider router={createAppRouter(["/"])} />);

    await user.type(
      screen.getByRole("searchbox", { name: /search downloads/i }),
      "ferro",
    );
    expect(screen.getByText("Installer.exe")).toBeInTheDocument();

    cleanup();
    render(<RouterProvider router={createAppRouter(["/history"])} />);

    expect(
      screen.getByRole("searchbox", { name: /search history/i }),
    ).toHaveValue("");
    expect(screen.getByText("Quarterly Report.pdf")).toBeInTheDocument();
  });

  it("disables add-download entry points while the engine is restarting", async () => {
    useEngineStatusMock.mockReturnValue({
      engine: createEngine("restarting"),
      error: null,
      mutationsAllowed: false,
    });
    const user = userEvent.setup();

    render(<RouterProvider router={createAppRouter(["/"])} />);

    expect(screen.getByText(/attempt 2 of 3/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new download/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /^add download$/i }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /new download/i }));
    expect(screen.queryByRole("heading", { name: /add download/i })).toBeNull();
  });

  it("opens the add download dialog with a magnet link from the protocol listener", async () => {
    render(<RouterProvider router={createAppRouter(["/"])} />);

    await waitFor(() =>
      expect(registerProtocolListenerMock).toHaveBeenCalledTimes(1),
    );
    act(() => {
      protocolOpenHandler?.("magnet:?xt=urn:btih:abcdef");
    });

    expect(
      screen.getByRole("heading", { name: /add download/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/download url/i)).toHaveValue(
      "magnet:?xt=urn:btih:abcdef",
    );
  });
});
