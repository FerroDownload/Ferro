import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TASK_POLL_INTERVAL_MS, useTasks } from "./useTasks";
import { useTaskStore } from "./useTaskStore";
import type { Task } from "@/shared/lib/types";

vi.mock("./useTaskStore", () => ({
  useTaskStore: vi.fn(),
}));

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active",
  progress_percent: 10,
  downloaded_bytes: 100,
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

describe("useTasks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("loads tasks on mount and at interval", async () => {
    const store = createStore();
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));

    renderHook(() => useTasks());

    expect(store.loadTasks).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(TASK_POLL_INTERVAL_MS);
    });

    expect(store.loadTasks).toHaveBeenCalledTimes(2);
  });

  it("returns task state", () => {
    const store = createStore({
      tasks: [createTask({ id: "task-1" })],
      isLoading: true,
      error: "fail",
    });
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));

    const { result } = renderHook(() => useTasks());

    expect(result.current.tasks).toEqual([createTask({ id: "task-1" })]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe("fail");
  });

  it("partitions tasks into active and history views without applying search", () => {
    const store = createStore({
      tasks: [
        createTask({
          id: "task-1",
          display_name: "Active report",
          source_uri: "https://example.com/report.pdf",
          status: "active",
        }),
        createTask({
          id: "task-2",
          display_name: "Paused guide",
          source_uri: "https://example.com/guide.pdf",
          status: "paused",
        }),
        createTask({
          id: "task-3",
          display_name: "Completed archive",
          source_uri: "https://example.com/archive.zip",
          status: "complete",
          completed_at: "2026-02-05T00:00:00Z",
        }),
      ],
    });
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));

    const { result } = renderHook(() => useTasks());

    expect(result.current.tasks.map((task) => task.id)).toEqual([
      "task-1",
      "task-2",
      "task-3",
    ]);
    expect(result.current.activeTasks.map((task) => task.id)).toEqual([
      "task-1",
      "task-2",
    ]);
    expect(result.current.historyTasks.map((task) => task.id)).toEqual([
      "task-3",
    ]);
  });

  it("orders active-view tasks by status group and each group's sort rule", () => {
    const store = createStore({
      tasks: [
        createTask({
          id: "paused-older",
          status: "paused",
          created_at: "2026-02-03T00:00:00Z",
        }),
        createTask({
          id: "waiting-second",
          status: "waiting",
          created_at: "2026-02-10T00:00:00Z",
        }),
        createTask({
          id: "complete-hidden",
          status: "complete",
          created_at: "2026-02-12T00:00:00Z",
          completed_at: "2026-02-13T00:00:00Z",
        }),
        createTask({
          id: "active-older",
          status: "active",
          created_at: "2026-02-01T00:00:00Z",
        }),
        createTask({
          id: "paused-newer",
          status: "paused",
          created_at: "2026-02-06T00:00:00Z",
        }),
        createTask({
          id: "waiting-first",
          status: "waiting",
          created_at: "2026-02-09T00:00:00Z",
        }),
        createTask({
          id: "active-newer",
          status: "active",
          created_at: "2026-02-05T00:00:00Z",
        }),
      ],
    });
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));

    const { result } = renderHook(() => useTasks());

    expect(result.current.activeTasks.map((task) => task.id)).toEqual([
      "active-newer",
      "active-older",
      "waiting-second",
      "waiting-first",
      "paused-newer",
      "paused-older",
    ]);
    expect(
      result.current.activeTasks
        .filter((task) => task.status === "waiting")
        .map((task) => [task.id, task.queue_position]),
    ).toEqual([
      ["waiting-second", 1],
      ["waiting-first", 2],
    ]);
  });

  it("orders history-view tasks by completed timestamp descending", () => {
    const store = createStore({
      tasks: [
        createTask({
          id: "stopped-middle",
          status: "stopped",
          completed_at: "2026-02-05T00:00:00Z",
        }),
        createTask({
          id: "error-newest",
          status: "error",
          completed_at: "2026-02-07T00:00:00Z",
        }),
        createTask({
          id: "active-hidden",
          status: "active",
          completed_at: null,
        }),
        createTask({
          id: "complete-oldest",
          status: "complete",
          completed_at: "2026-02-03T00:00:00Z",
        }),
      ],
    });
    vi.mocked(useTaskStore).mockImplementation((selector) => selector(store));

    const { result } = renderHook(() => useTasks());

    expect(result.current.historyTasks.map((task) => task.id)).toEqual([
      "error-newest",
      "stopped-middle",
      "complete-oldest",
    ]);
  });
});
