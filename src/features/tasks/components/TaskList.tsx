import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Card } from "@/components/ui/card";
import { EmptyActivePanel } from "@/features/onboarding/components/EmptyActivePanel";
import { useTaskSelection } from "@/features/tasks/hooks/useTaskSelection";
import { useTaskStore } from "@/features/tasks/hooks/useTaskStore";
import type { Task } from "@/shared/lib/types";
import { NoTaskSearchMatches } from "./TaskSearchInput";
import { TaskRow } from "./TaskRow";

const ROW_HEIGHT = 88;

type TaskListProps = {
  tasks: Task[];
  height?: number;
  mutationsAllowed?: boolean;
  onAddDownload?: () => void;
  emptySearchQuery?: string;
};

type SelectTask = (
  taskId: string,
  index: number,
  options?: {
    range?: boolean;
    toggle?: boolean;
  },
) => void;

type VirtualTaskRowProps = {
  task: Task;
  virtualIndex: number;
  virtualStart: number;
  virtualSize: number;
  isSelected: boolean;
  mutationsAllowed: boolean;
  selectTask: SelectTask;
};

const VirtualTaskRow = memo(
  ({
    task,
    virtualIndex,
    virtualStart,
    virtualSize,
    isSelected,
    mutationsAllowed,
    selectTask,
  }: VirtualTaskRowProps) => {
    const style = useMemo<CSSProperties>(
      () => ({
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${virtualSize}px`,
        transform: `translateY(${virtualStart}px)`,
      }),
      [virtualSize, virtualStart],
    );

    const handleSelect = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        selectTask(task.id, virtualIndex, {
          range: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        });
      },
      [selectTask, task.id, virtualIndex],
    );

    return (
      <TaskRow
        task={task}
        rowIndex={virtualIndex + 1}
        isSelected={isSelected}
        mutationsAllowed={mutationsAllowed}
        onSelect={handleSelect}
        style={style}
      />
    );
  },
);

// Waiting tasks form a contiguous, reorderable block. This variant adds dnd-kit
// sortable wiring and composes the virtualizer's vertical offset with the
// sortable drag transform so dragging works inside the virtualized list.
const SortableVirtualTaskRow = memo(
  ({
    task,
    virtualIndex,
    virtualStart,
    virtualSize,
    isSelected,
    mutationsAllowed,
    selectTask,
  }: VirtualTaskRowProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      setActivatorNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: task.id });

    const style = useMemo<CSSProperties>(
      () => ({
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${virtualSize}px`,
        transform: `translate3d(${transform?.x ?? 0}px, ${
          (transform?.y ?? 0) + virtualStart
        }px, 0)`,
        transition: transition ?? undefined,
        zIndex: isDragging ? 10 : undefined,
      }),
      [transform, transition, isDragging, virtualSize, virtualStart],
    );

    const handleSelect = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        selectTask(task.id, virtualIndex, {
          range: event.shiftKey,
          toggle: event.ctrlKey || event.metaKey,
        });
      },
      [selectTask, task.id, virtualIndex],
    );

    const dragHandle = useMemo(
      () => ({ setActivatorNodeRef, attributes, listeners }),
      [setActivatorNodeRef, attributes, listeners],
    );

    return (
      <TaskRow
        task={task}
        rowIndex={virtualIndex + 1}
        isSelected={isSelected}
        mutationsAllowed={mutationsAllowed}
        onSelect={handleSelect}
        style={style}
        rowRef={setNodeRef}
        dragHandle={dragHandle}
        isDragging={isDragging}
      />
    );
  },
);

export const TaskList = ({
  tasks,
  height,
  mutationsAllowed = true,
  onAddDownload,
  emptySearchQuery = "",
}: TaskListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const { selectedIds, selectTask } = useTaskSelection(tasks);
  const moveTaskToPosition = useTaskStore((state) => state.moveTaskToPosition);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  const waitingIds = useMemo(
    () =>
      tasks.filter((task) => task.status === "waiting").map((task) => task.id),
    [tasks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const activeId = String(active.id);
      const targetIndex = waitingIds.indexOf(String(over.id));
      if (targetIndex === -1 || !waitingIds.includes(activeId)) {
        return;
      }
      // targetIndex is the 0-based destination within the waiting queue, which
      // maps directly to aria2 changePosition POS_SET.
      void moveTaskToPosition(activeId, targetIndex);
    },
    [waitingIds, moveTaskToPosition],
  );

  // Reordering only applies to the waiting queue, and only when the engine
  // accepts mutations and there is more than one waiting task to sort.
  const dragEnabled = mutationsAllowed && waitingIds.length > 1;

  if (tasks.length === 0) {
    if (emptySearchQuery.trim()) {
      return <NoTaskSearchMatches query={emptySearchQuery} />;
    }

    return (
      <EmptyActivePanel
        onAddDownload={onAddDownload}
        addDownloadDisabled={!mutationsAllowed}
      />
    );
  }

  const rows = (
    <div
      role="rowgroup"
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const task = tasks[virtualRow.index];
        const rowProps = {
          task,
          virtualIndex: virtualRow.index,
          virtualStart: virtualRow.start,
          virtualSize: virtualRow.size,
          isSelected: selectedIds.has(task.id),
          mutationsAllowed,
          selectTask,
        };
        if (dragEnabled && task.status === "waiting") {
          return <SortableVirtualTaskRow key={task.id} {...rowProps} />;
        }
        return <VirtualTaskRow key={task.id} {...rowProps} />;
      })}
    </div>
  );

  return (
    <Card
      ref={parentRef}
      role="grid"
      aria-label="Active downloads"
      aria-rowcount={tasks.length}
      className="min-h-[320px] flex-1 overflow-auto rounded-md shadow-sm"
      style={height ? { height } : undefined}
    >
      {dragEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={waitingIds}
            strategy={verticalListSortingStrategy}
          >
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        rows
      )}
    </Card>
  );
};
