import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskStore } from "./useTaskStore";
import { fetchTasks } from "@/features/tasks/services/engineClient";
import {
  cancelTask,
  executeOptimisticAction,
  pauseTask,
  removeTask,
  removeTaskWithFiles,
  reorderTaskToPosition,
  reorderWaitingTasks,
  replaceTask,
  retryTask,
} from "@/features/tasks/services/taskCommands";
import type { Task } from "@/shared/lib/types";

vi.mock("@/features/tasks/services/engineClient", () => ({
  fetchTasks: vi.fn(),
}));

vi.mock("@/features/tasks/services/taskCommands", () => ({
  executeOptimisticAction: vi.fn(),
  pauseTask: vi.fn(),
  removeTask: vi.fn(),
  removeTaskWithFiles: vi.fn(),
  reorderTaskToPosition: vi.fn(),
  reorderWaitingTasks: vi.fn(),
  retryTask: vi.fn(),
  replaceTask: vi.fn(),
  removeTaskFromList: vi.fn(),
  resumeTask: vi.fn(),
  cancelTask: vi.fn(),
  updateTaskStatus: vi.fn(),
}));

describe("useTaskStore", () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], isLoading: false, error: null });
    vi.resetAllMocks();
    vi.mocked(executeOptimisticAction).mockImplementation(
      async ({ current, update, apply, command }) => {
        apply(update(current));
        await command();
      },
    );
  });

  it("loads tasks", async () => {
    vi.mocked(fetchTasks).mockResolvedValueOnce([
      {
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
      },
    ]);

    await useTaskStore.getState().loadTasks();

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("captures errors", async () => {
    vi.mocked(fetchTasks).mockRejectedValueOnce(new Error("fail"));

    await useTaskStore.getState().loadTasks();

    const state = useTaskStore.getState();
    expect(state.error).toBe("fail");
    expect(state.isLoading).toBe(false);
  });

  it("calls pause command", async () => {
    useTaskStore.setState({
      tasks: [
        {
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
        },
      ],
      isLoading: false,
      error: null,
    });

    await useTaskStore.getState().pauseTask("task-1");

    expect(pauseTask).toHaveBeenCalledWith("task-1");
  });

  it("calls remove command", async () => {
    useTaskStore.setState({
      tasks: [
        {
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
        },
      ],
      isLoading: false,
      error: null,
    });

    await useTaskStore.getState().removeTask("task-1");

    expect(removeTask).toHaveBeenCalledWith("task-1");
  });

  it("calls remove-with-files command", async () => {
    useTaskStore.setState({
      tasks: [
        {
          id: "task-1",
          aria2_gid: null,
          source_uri: "https://example.com/file.iso",
          display_name: "file.iso",
          destination_path: "C:/Users/Test/Downloads/file.iso",
          status: "complete",
          progress_percent: 100,
          downloaded_bytes: 1024,
          total_bytes: 1024,
          download_speed_bps: 0,
          upload_speed_bps: 0,
          created_at: "2026-02-04T00:00:00Z",
          updated_at: "2026-02-04T00:00:00Z",
          completed_at: "2026-02-05T00:00:00Z",
          uploaded_bytes: 0,
          orphan_imported: false,
          error_message: null,
          is_torrent: false,
          torrent_info_hash: null,
          selected_files: null,
        },
      ],
      isLoading: false,
      error: null,
    });

    await useTaskStore.getState().removeTaskWithFiles("task-1");

    expect(removeTaskWithFiles).toHaveBeenCalledWith("task-1");
  });

  it("calls cancel command", async () => {
    useTaskStore.setState({
      tasks: [
        {
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
        },
      ],
      isLoading: false,
      error: null,
    });

    await useTaskStore.getState().cancelTask("task-1");

    expect(cancelTask).toHaveBeenCalledWith("task-1");
  });

  it("optimistically reorders the waiting queue then sends the absolute position", async () => {
    const waitingTask = (id: string): Task => ({
      id,
      aria2_gid: `gid-${id}`,
      source_uri: "https://example.com/file.iso",
      display_name: `${id}.iso`,
      destination_path: "C:/Users/Test/Downloads",
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
    });
    const initial = [waitingTask("task-1"), waitingTask("task-2")];
    const reordered = [initial[1], initial[0]];
    useTaskStore.setState({ tasks: initial, isLoading: false, error: null });
    vi.mocked(reorderWaitingTasks).mockReturnValue(reordered);
    vi.mocked(reorderTaskToPosition).mockResolvedValueOnce(0);

    await useTaskStore.getState().moveTaskToPosition("task-1", 1);

    expect(reorderWaitingTasks).toHaveBeenCalledWith(initial, "task-1", 1);
    expect(useTaskStore.getState().tasks).toEqual(reordered);
    expect(reorderTaskToPosition).toHaveBeenCalledWith("task-1", 1);
  });

  it("does not optimistically move a retrying error task out of History", async () => {
    const errorTask: Task = {
      id: "task-1",
      aria2_gid: null,
      source_uri: "https://example.com/file.iso",
      display_name: "file.iso",
      destination_path: "C:/Users/Test/Downloads/file.iso",
      status: "error",
      progress_percent: 25,
      downloaded_bytes: 256,
      total_bytes: 1024,
      download_speed_bps: 0,
      upload_speed_bps: 0,
      created_at: "2026-02-04T00:00:00Z",
      updated_at: "2026-02-04T00:00:00Z",
      completed_at: "2026-02-05T00:00:00Z",
      uploaded_bytes: 0,
      orphan_imported: false,
      error_message: "network failure",
      is_torrent: false,
      torrent_info_hash: null,
      selected_files: null,
    };
    let resolveRetry!: (task: Task) => void;
    const retryPromise = new Promise<Task>((resolve) => {
      resolveRetry = resolve;
    });
    const retriedTask: Task = {
      ...errorTask,
      aria2_gid: "gid-new",
      status: "waiting",
      completed_at: null,
      error_message: null,
    };
    useTaskStore.setState({
      tasks: [errorTask],
      isLoading: false,
      error: null,
    });
    vi.mocked(retryTask).mockReturnValueOnce(retryPromise);
    vi.mocked(replaceTask).mockReturnValueOnce([retriedTask]);

    const retry = useTaskStore.getState().retryTask("task-1");

    expect(executeOptimisticAction).not.toHaveBeenCalled();
    expect(useTaskStore.getState().tasks).toEqual([errorTask]);

    resolveRetry(retriedTask);
    await retry;

    expect(retryTask).toHaveBeenCalledWith("task-1");
    expect(replaceTask).toHaveBeenCalledWith([errorTask], retriedTask);
    expect(useTaskStore.getState().tasks).toEqual([retriedTask]);
  });
});
