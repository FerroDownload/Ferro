import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

import { applyOptimisticUpdate } from "@/shared/lib/optimistic";
import type { Task, TaskStatus, TorrentMetadata } from "@/shared/lib/types";
import type { TorrentSource } from "./torrentCommands";
import { addTorrentTask as invokeTorrentAdd } from "./torrentCommands";

export type OptimisticActionOptions<T> = {
  current: T;
  update: (current: T) => T;
  apply: (next: T) => void;
  command: () => Promise<void>;
  onError?: (message: string) => void;
};

export async function executeOptimisticAction<T>(
  options: OptimisticActionOptions<T>,
): Promise<void> {
  const { next, rollback } = applyOptimisticUpdate(
    options.current,
    options.update,
  );
  options.apply(next);

  try {
    await options.command();
  } catch (error) {
    options.apply(rollback());
    const message = error instanceof Error ? error.message : "Unknown error";
    options.onError?.(message);
    throw error;
  }
}

export function updateTaskStatus(
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
): Task[] {
  return tasks.map((task) => (task.id === taskId ? { ...task, status } : task));
}

export function removeTaskFromList(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((task) => task.id !== taskId);
}

export function replaceTask(tasks: Task[], nextTask: Task): Task[] {
  return tasks.map((task) => (task.id === nextTask.id ? nextTask : task));
}

export async function addTask(url: string, destination: string): Promise<void> {
  await invoke("add_task", { url, destination });
}

export async function addTorrentTask(payload: {
  source: TorrentSource;
  destination: string;
  selectedFiles: string[];
  selectedIndices: number[];
  seedRatioTarget: number;
  metadata: TorrentMetadata;
}): Promise<void> {
  await invokeTorrentAdd({
    source: payload.source,
    destination: payload.destination,
    selectedFiles: payload.selectedFiles,
    selectedIndices: payload.selectedIndices,
    seedRatioTarget: payload.seedRatioTarget,
    infoHash: payload.metadata.info_hash,
    displayName: payload.metadata.name,
    metadata: payload.metadata,
  });
}

export async function pauseTask(taskId: string): Promise<void> {
  await invoke("pause_task", { taskId });
}

export async function resumeTask(taskId: string): Promise<void> {
  await invoke("resume_task", { taskId });
}

export async function pauseAllTasks(): Promise<void> {
  await invoke("pause_all_tasks");
}

export async function resumeAllTasks(): Promise<void> {
  await invoke("resume_all_tasks");
}

export async function cancelTask(taskId: string): Promise<void> {
  await invoke("cancel_task", { taskId });
}

export async function removeTask(taskId: string): Promise<void> {
  await invoke("remove_task", { taskId });
}

export async function removeTaskWithFiles(taskId: string): Promise<void> {
  await invoke("delete_task_with_files", { taskId });
}

export async function retryTask(taskId: string): Promise<Task> {
  return invoke("retry_task", { taskId });
}

export async function reorderTaskToPosition(
  taskId: string,
  position: number,
): Promise<number> {
  return invoke("reorder_task_to", { taskId, position });
}

// Pure reorder of the contiguous `waiting` block to match a drag-and-drop move,
// mirroring aria2's POS_SET semantics so the optimistic update matches the engine
// order returned by the next poll.
export function reorderWaitingTasks(
  tasks: Task[],
  taskId: string,
  toIndex: number,
): Task[] {
  const waiting = tasks.filter((task) => task.status === "waiting");
  const fromIndex = waiting.findIndex((task) => task.id === taskId);
  if (fromIndex === -1) {
    return tasks;
  }
  const clamped = Math.max(0, Math.min(toIndex, waiting.length - 1));
  if (clamped === fromIndex) {
    return tasks;
  }
  const reordered = waiting.slice();
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(clamped, 0, moved);
  let cursor = 0;
  return tasks.map((task) =>
    task.status === "waiting" ? reordered[cursor++] : task,
  );
}

// Ref: https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/opener/README.md
export async function openTaskDestination(destination: string): Promise<void> {
  await openPath(destination);
}

export async function triggerRestartRecovery(): Promise<void> {
  await invoke("engine_start");
}
