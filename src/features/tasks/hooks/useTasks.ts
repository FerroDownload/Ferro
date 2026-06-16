import { useEffect, useMemo } from "react";

import type { Task } from "@/shared/lib/types";
import { useTaskStore } from "./useTaskStore";

export const TASK_POLL_INTERVAL_MS = 500;
const HISTORY_STATUSES = new Set(["complete", "stopped", "error"]);

const timestampValue = (timestamp: string | null) => {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const descendingTimestamp = (left: string | null, right: string | null) =>
  timestampValue(right) - timestampValue(left);

const orderActiveTasks = (tasks: Task[]) => {
  const active = tasks
    .filter((task) => task.status === "active")
    .sort((left, right) =>
      descendingTimestamp(left.created_at, right.created_at),
    );
  const waiting = tasks
    .filter((task) => task.status === "waiting")
    .map((task, index) => ({
      ...task,
      queue_position: index + 1,
    }));
  const paused = tasks
    .filter((task) => task.status === "paused")
    .sort((left, right) =>
      descendingTimestamp(left.created_at, right.created_at),
    );

  return [...active, ...waiting, ...paused];
};

const orderHistoryTasks = (tasks: Task[]) =>
  tasks
    .filter((task) => HISTORY_STATUSES.has(task.status))
    .sort((left, right) =>
      descendingTimestamp(left.completed_at, right.completed_at),
    );

export const useTasks = () => {
  const allTasks = useTaskStore((state) => state.tasks);
  const isLoading = useTaskStore((state) => state.isLoading);
  const error = useTaskStore((state) => state.error);
  const loadTasks = useTaskStore((state) => state.loadTasks);

  const activeTasks = useMemo(() => orderActiveTasks(allTasks), [allTasks]);

  const historyTasks = useMemo(() => orderHistoryTasks(allTasks), [allTasks]);

  useEffect(() => {
    void loadTasks();
    const intervalId = window.setInterval(() => {
      void loadTasks();
    }, TASK_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadTasks]);

  return {
    tasks: allTasks,
    activeTasks,
    historyTasks,
    allTasks,
    isLoading,
    error,
    reload: loadTasks,
  };
};
