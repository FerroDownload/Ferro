import { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { fetchTasks } from "@/features/tasks/services/engineClient";
import {
  cancelTask,
  executeOptimisticAction,
  pauseTask,
  removeTask,
  removeTaskFromList,
  removeTaskWithFiles,
  reorderTaskToPosition,
  reorderWaitingTasks,
  replaceTask,
  retryTask,
  resumeTask,
  updateTaskStatus,
} from "@/features/tasks/services/taskCommands";
import type { Task } from "@/shared/lib/types";

export const taskQueryClient = new QueryClient();

type TaskStoreState = {
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
};

export const useTaskStore = create<TaskStoreState>()((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,
  loadTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await taskQueryClient.fetchQuery({
        queryKey: ["tasks"],
        queryFn: fetchTasks,
      });
      set({ tasks, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unknown error",
        isLoading: false,
      });
    }
  },
  pauseTask: async (taskId) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => updateTaskStatus(tasks, taskId, "paused"),
      apply: (tasks) => set({ tasks }),
      command: () => pauseTask(taskId),
      onError: (message) => set({ error: message }),
    });
  },
  resumeTask: async (taskId) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => updateTaskStatus(tasks, taskId, "waiting"),
      apply: (tasks) => set({ tasks }),
      command: () => resumeTask(taskId),
      onError: (message) => set({ error: message }),
    });
  },
  cancelTask: async (taskId) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => updateTaskStatus(tasks, taskId, "stopped"),
      apply: (tasks) => set({ tasks }),
      command: () => cancelTask(taskId),
      onError: (message) => set({ error: message }),
    });
  },
  removeTask: async (taskId) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => removeTaskFromList(tasks, taskId),
      apply: (tasks) => set({ tasks }),
      command: () => removeTask(taskId),
      onError: (message) => set({ error: message }),
    });
  },
  removeTaskWithFiles: async (taskId) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => removeTaskFromList(tasks, taskId),
      apply: (tasks) => set({ tasks }),
      command: () => removeTaskWithFiles(taskId),
      onError: (message) => set({ error: message }),
    });
  },
  retryTask: async (taskId) => {
    try {
      const nextTask = await retryTask(taskId);
      set({ tasks: replaceTask(get().tasks, nextTask), error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      set({ error: message });
      throw error;
    }
  },
  moveTaskToPosition: async (taskId, position) => {
    const current = get().tasks;
    await executeOptimisticAction({
      current,
      update: (tasks) => reorderWaitingTasks(tasks, taskId, position),
      apply: (tasks) => set({ tasks }),
      command: async () => {
        await reorderTaskToPosition(taskId, position);
      },
      onError: (message) => set({ error: message }),
    });
  },
}));
