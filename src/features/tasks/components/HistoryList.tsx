import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Card } from "@/components/ui/card";
import { EmptyHistoryPanel } from "@/features/onboarding/components/EmptyHistoryPanel";
import type { Task } from "@/shared/lib/types";
import { NoTaskSearchMatches } from "./TaskSearchInput";
import { TaskRow } from "./TaskRow";

const ROW_HEIGHT = 88;
const HISTORY_STATUSES: Task["status"][] = ["complete", "stopped", "error"];

type HistoryListProps = {
  tasks: Task[];
  height?: number;
  mutationsAllowed?: boolean;
  emptySearchQuery?: string;
};

export const HistoryList = ({
  tasks,
  height,
  mutationsAllowed = true,
  emptySearchQuery = "",
}: HistoryListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const historyTasks = tasks.filter((task) =>
    HISTORY_STATUSES.includes(task.status),
  );

  const virtualizer = useVirtualizer({
    count: historyTasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  if (historyTasks.length === 0) {
    if (emptySearchQuery.trim()) {
      return <NoTaskSearchMatches query={emptySearchQuery} />;
    }

    return <EmptyHistoryPanel />;
  }

  return (
    <Card
      ref={parentRef}
      role="grid"
      aria-label="Download history"
      aria-rowcount={historyTasks.length}
      className="min-h-[320px] flex-1 overflow-auto rounded-md shadow-sm"
      style={height ? { height } : undefined}
    >
      <div
        role="rowgroup"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const task = historyTasks[virtualRow.index];
          return (
            <TaskRow
              key={task.id}
              task={task}
              rowIndex={virtualRow.index + 1}
              mutationsAllowed={mutationsAllowed}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          );
        })}
      </div>
    </Card>
  );
};
