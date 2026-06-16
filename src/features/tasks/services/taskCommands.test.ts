import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";

import type { Task } from "@/shared/lib/types";
import {
  addTask,
  addTorrentTask,
  cancelTask,
  executeOptimisticAction,
  pauseTask,
  pauseAllTasks,
  removeTask,
  removeTaskFromList,
  removeTaskWithFiles,
  replaceTask,
  reorderTaskToPosition,
  reorderWaitingTasks,
  retryTask,
  resumeAllTasks,
  resumeTask,
  triggerRestartRecovery,
  updateTaskStatus,
} from "./taskCommands";
import { addTorrentTask as invokeTorrentAdd } from "./torrentCommands";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./torrentCommands", () => ({
  addTorrentTask: vi.fn(),
}));

const tasks: Task[] = [
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
];

describe("taskCommands optimistic actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("invokes add_torrent_task wrapper", async () => {
    vi.mocked(invokeTorrentAdd).mockResolvedValueOnce(undefined);

    await addTorrentTask({
      source: { magnet: "magnet:?xt=urn:btih:abcd" },
      destination: "C:/Users/Test/Downloads",
      selectedFiles: ["Example/file.bin"],
      selectedIndices: [1],
      seedRatioTarget: 1.0,
      metadata: {
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
      },
    });

    expect(invokeTorrentAdd).toHaveBeenCalledWith({
      source: { magnet: "magnet:?xt=urn:btih:abcd" },
      destination: "C:/Users/Test/Downloads",
      selectedFiles: ["Example/file.bin"],
      selectedIndices: [1],
      seedRatioTarget: 1.0,
      infoHash: "abcd",
      displayName: "Example",
      metadata: {
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
      },
    });
  });

  it("invokes add_task for new downloads", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await addTask("https://example.com/file.zip", "C:/Users/Test/Downloads");

    expect(invoke).toHaveBeenCalledWith("add_task", {
      url: "https://example.com/file.zip",
      destination: "C:/Users/Test/Downloads",
    });
  });

  it.each([
    ["pause", pauseTask, "pause_task"],
    ["resume", resumeTask, "resume_task"],
    ["cancel", cancelTask, "cancel_task"],
    ["remove", removeTask, "remove_task"],
    ["delete-with-files", removeTaskWithFiles, "delete_task_with_files"],
  ])("invokes %s_task", async (_label, command, invokeName) => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await command("task-1");

    expect(invoke).toHaveBeenCalledWith(invokeName, { taskId: "task-1" });
  });

  it("invokes reorder_task_to with the absolute queue position", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(2);

    await expect(reorderTaskToPosition("task-1", 3)).resolves.toBe(2);

    expect(invoke).toHaveBeenCalledWith("reorder_task_to", {
      taskId: "task-1",
      position: 3,
    });
  });

  describe("reorderWaitingTasks", () => {
    const make = (id: string, status: Task["status"]): Task => ({
      ...tasks[0],
      id,
      status,
    });

    it("reorders only the waiting block and keeps other rows in place", () => {
      const list = [
        make("a", "active"),
        make("w1", "waiting"),
        make("w2", "waiting"),
        make("w3", "waiting"),
      ];

      const result = reorderWaitingTasks(list, "w3", 0);

      expect(result.map((task) => task.id)).toEqual(["a", "w3", "w1", "w2"]);
    });

    it("returns the original list when the task id is unknown", () => {
      const list = [make("w1", "waiting"), make("w2", "waiting")];

      expect(reorderWaitingTasks(list, "missing", 0)).toBe(list);
    });

    it("clamps the destination index into the waiting range", () => {
      const list = [
        make("w1", "waiting"),
        make("w2", "waiting"),
        make("w3", "waiting"),
      ];

      const result = reorderWaitingTasks(list, "w1", 99);

      expect(result.map((task) => task.id)).toEqual(["w2", "w3", "w1"]);
    });
  });

  it("invokes retry_task and returns the updated task", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      ...tasks[0],
      aria2_gid: "gid-new",
      status: "waiting",
      completed_at: null,
      error_message: null,
      download_speed_bps: 0,
      upload_speed_bps: 0,
    });

    await expect(retryTask("task-1")).resolves.toMatchObject({
      aria2_gid: "gid-new",
      status: "waiting",
    });

    expect(invoke).toHaveBeenCalledWith("retry_task", { taskId: "task-1" });
  });

  it("triggers restart recovery via engine_start", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await triggerRestartRecovery();

    expect(invoke).toHaveBeenCalledWith("engine_start");
  });

  it("invokes pause_all_tasks", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await pauseAllTasks();

    expect(invoke).toHaveBeenCalledWith("pause_all_tasks");
  });

  it("invokes resume_all_tasks", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await resumeAllTasks();

    expect(invoke).toHaveBeenCalledWith("resume_all_tasks");
  });

  it("applies optimistic update on success", async () => {
    let current = tasks;
    const apply = vi.fn((next) => {
      current = next;
    });

    await executeOptimisticAction({
      current,
      update: (value) => updateTaskStatus(value, "task-1", "paused"),
      apply,
      command: vi.fn().mockResolvedValue(undefined),
    });

    expect(current[0].status).toBe("paused");
  });

  it("rolls back optimistic update on error", async () => {
    let current = tasks;
    const apply = vi.fn((next) => {
      current = next;
    });
    const onError = vi.fn();

    await expect(
      executeOptimisticAction({
        current,
        update: (value) => removeTaskFromList(value, "task-1"),
        apply,
        command: vi.fn().mockRejectedValue(new Error("fail")),
        onError,
      }),
    ).rejects.toThrow("fail");

    expect(current).toEqual(tasks);
    expect(onError).toHaveBeenCalledWith("fail");
  });

  it("replaces a task with the server-returned retry state", () => {
    const updated = replaceTask(tasks, {
      ...tasks[0],
      aria2_gid: "gid-new",
      status: "waiting",
    });

    expect(updated[0].aria2_gid).toBe("gid-new");
    expect(updated[0].status).toBe("waiting");
  });
});
