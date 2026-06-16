import { useCallback, useEffect, useMemo, useState } from "react";

import type { Task } from "@/shared/lib/types";

type SelectOptions = {
  range?: boolean;
  toggle?: boolean;
};

export const useTaskSelection = (tasks: Task[]) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  useEffect(() => {
    const taskIds = new Set(tasks.map((task) => task.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => taskIds.has(id)));
      return next.size === current.size ? current : next;
    });
    setAnchorIndex((current) =>
      current !== null && current < tasks.length ? current : null,
    );
  }, [tasks]);

  const selectedTaskIds = useMemo(() => [...selectedIds], [selectedIds]);

  const selectTask = useCallback(
    (taskId: string, index: number, options: SelectOptions = {}) => {
      setSelectedIds((current) => {
        if (options.range && anchorIndex !== null) {
          const start = Math.min(anchorIndex, index);
          const end = Math.max(anchorIndex, index);
          return new Set(tasks.slice(start, end + 1).map((task) => task.id));
        }

        if (options.toggle) {
          const next = new Set(current);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return next;
        }

        return new Set([taskId]);
      });
      setAnchorIndex(index);
    },
    [anchorIndex, tasks],
  );

  return {
    selectedIds,
    selectedTaskIds,
    selectTask,
  };
};
