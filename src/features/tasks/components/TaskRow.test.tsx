import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskRow } from "./TaskRow";
import type { Task } from "@/shared/lib/types";
import { useTaskStore } from "@/features/tasks/hooks/useTaskStore";
import { openTaskDestination } from "@/features/tasks/services/taskCommands";
import { fetchStoredTorrentMetadata } from "@/features/tasks/services/torrentCommands";

vi.mock("@/features/tasks/hooks/useTaskStore", () => ({
  useTaskStore: vi.fn(),
}));

vi.mock("@/features/tasks/services/taskCommands", () => ({
  openTaskDestination: vi.fn(),
}));

vi.mock("@/features/tasks/services/torrentCommands", () => ({
  fetchStoredTorrentMetadata: vi.fn(),
}));

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active",
  progress_percent: 42,
  downloaded_bytes: 420,
  total_bytes: 1000,
  download_speed_bps: 0,
  upload_speed_bps: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,

  uploaded_bytes: 0,

  orphan_imported: false,
  error_message: null,
  is_torrent: false,
  torrent_info_hash: null,
  selected_files: null,
  ...overrides,
});

const createStore = (
  overrides?: Partial<{
    tasks: Task[];
    isLoading: boolean;
    error: string | null;
    loadTasks: () => Promise<void>;
    pauseTask: (taskId: string) => Promise<void>;
    resumeTask: (taskId: string) => Promise<void>;
    cancelTask: (taskId: string) => Promise<void>;
    removeTask: (taskId: string) => Promise<void>;
    removeTaskWithFiles: (taskId: string) => Promise<void>;
    retryTask: (taskId: string) => Promise<void>;
    moveTaskToPosition: (taskId: string, position: number) => Promise<void>;
  }>,
) => ({
  tasks: [],
  isLoading: false,
  error: null,
  loadTasks: vi.fn().mockResolvedValue(undefined),
  pauseTask: vi.fn().mockResolvedValue(undefined),
  resumeTask: vi.fn().mockResolvedValue(undefined),
  cancelTask: vi.fn().mockResolvedValue(undefined),
  removeTask: vi.fn().mockResolvedValue(undefined),
  removeTaskWithFiles: vi.fn().mockResolvedValue(undefined),
  retryTask: vi.fn().mockResolvedValue(undefined),
  moveTaskToPosition: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe("TaskRow", () => {
  it("renders task metadata", () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );

    render(<TaskRow task={createTask({})} />);

    expect(screen.getByText("Example File")).toBeInTheDocument();
    expect(
      screen.getByText("C:/Users/Test/Downloads/file.zip"),
    ).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("skips rerendering when props remain referentially stable", () => {
    const store = createStore();
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));
    const task = createTask({});

    const { rerender } = render(
      <TaskRow
        task={task}
        rowIndex={1}
        isSelected={false}
        mutationsAllowed={true}
      />,
    );
    const selectorCallsAfterInitialRender =
      vi.mocked(useTaskStore).mock.calls.length;

    rerender(
      <TaskRow
        task={task}
        rowIndex={1}
        isSelected={false}
        mutationsAllowed={true}
      />,
    );

    expect(vi.mocked(useTaskStore).mock.calls.length).toBe(
      selectorCallsAfterInitialRender,
    );
  });

  it("shows the actual queue position for waiting tasks", () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );

    render(
      <TaskRow
        task={createTask({
          status: "waiting",
          queue_position: 3,
        })}
      />,
    );

    expect(screen.getByLabelText("Queue position: 3")).toHaveTextContent(
      "Queue #3",
    );
  });

  it("does not show a queue position outside waiting tasks", () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );

    render(
      <TaskRow
        task={createTask({
          status: "active",
          queue_position: 3,
        })}
      />,
    );

    expect(screen.queryByText("Queue #3")).not.toBeInTheDocument();
  });

  it("renders a credential-stripped source URL", () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );

    render(
      <TaskRow
        task={createTask({
          source_uri:
            "https://user:pass@example.com/private/file.zip?token=secret",
        })}
      />,
    );

    expect(
      screen.getByText("https://example.com/private/file.zip"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "https://user:pass@example.com/private/file.zip?token=secret",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows torrent details when available", async () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );
    vi.mocked(fetchStoredTorrentMetadata).mockResolvedValueOnce({
      info_hash: "abcd",
      name: "Example Torrent",
      total_bytes: 2048,
      files: [
        {
          index: 1,
          path: "Example/file-a.bin",
          bytes: 1024,
          completed_bytes: 0,
          selected: true,
        },
      ],
      trackers: ["udp://tracker"],
      peers: 2,
      seeders: 1,
    });
    const user = userEvent.setup();

    render(
      <TaskRow
        task={createTask({
          is_torrent: true,
          torrent_info_hash: "abcd",
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("Torrent details")).toBeInTheDocument();
  });

  it("alerts when metadata is missing", async () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );
    vi.mocked(fetchStoredTorrentMetadata).mockRejectedValueOnce(
      new Error("missing"),
    );
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <TaskRow
        task={createTask({
          is_torrent: true,
          torrent_info_hash: "abcd",
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(alertSpy).toHaveBeenCalledWith("Torrent metadata not available");
    alertSpy.mockRestore();
  });

  it("invokes pause when active", async () => {
    const pauseTask = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          pauseTask,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "active" })} />);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(pauseTask).toHaveBeenCalledWith("task-1");
  });

  it("invokes resume when paused", async () => {
    const resumeTask = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          resumeTask,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "paused" })} />);

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(resumeTask).toHaveBeenCalledWith("task-1");
  });

  it("invokes cancel when waiting", async () => {
    const cancelTask = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          cancelTask,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "waiting" })} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelTask).toHaveBeenCalledWith("task-1");
  });

  it("invokes delete for history tasks", async () => {
    const removeTask = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          removeTask,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "complete" })} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(removeTask).toHaveBeenCalledWith("task-1");
  });

  it("confirms before deleting history task files", async () => {
    const removeTaskWithFiles = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          removeTaskWithFiles,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "stopped" })} />);

    await user.click(screen.getByRole("button", { name: "Delete with files" }));
    expect(
      screen.getByRole("dialog", { name: /delete downloaded files/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /move files to trash/i }),
    ).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: /move files to trash/i }),
    );

    expect(removeTaskWithFiles).toHaveBeenCalledWith("task-1");
  });

  it("does not delete task files when confirmation is cancelled and restores trigger focus", async () => {
    const removeTaskWithFiles = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          removeTaskWithFiles,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "stopped" })} />);

    const trigger = screen.getByRole("button", { name: "Delete with files" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeTaskWithFiles).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("invokes retry for error tasks", async () => {
    const retryTask = vi.fn();
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(
        createStore({
          retryTask,
        }),
      ),
    );
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "error" })} />);

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryTask).toHaveBeenCalledWith("task-1");
  });

  it("opens the destination when clicking Open", async () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );
    vi.mocked(openTaskDestination).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "complete" })} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(openTaskDestination).toHaveBeenCalledWith(
      "C:/Users/Test/Downloads/file.zip",
    );
  });

  it("alerts when the destination is missing", async () => {
    vi.mocked(useTaskStore).mockImplementation((selector) =>
      selector(createStore()),
    );
    vi.mocked(openTaskDestination).mockRejectedValue(new Error("Not found"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<TaskRow task={createTask({ status: "complete" })} />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(alertSpy).toHaveBeenCalledWith("File/Folder not found");
    alertSpy.mockRestore();
  });
});
