import {
  memo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileDown,
  Folder,
  GripVertical,
  Link2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTaskStore } from "@/features/tasks/hooks/useTaskStore";
import { openTaskDestination } from "@/features/tasks/services/taskCommands";
import { fetchStoredTorrentMetadata } from "@/features/tasks/services/torrentCommands";
import { displayUrl } from "@/features/tasks/utils/displayUrl";
import { formatSpeed } from "@/shared/lib/formatters";
import type { Task, TorrentMetadata } from "@/shared/lib/types";
import { cn } from "@/lib/utils";
import { TaskRowActions } from "./TaskRowActions";
import { TorrentDetails } from "./TorrentDetails";

type TaskDragHandle = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
};

type TaskRowProps = {
  task: Task;
  style?: CSSProperties;
  rowIndex?: number;
  isSelected?: boolean;
  mutationsAllowed?: boolean;
  onSelect?: (event: MouseEvent<HTMLDivElement>) => void;
  rowRef?: (element: HTMLElement | null) => void;
  dragHandle?: TaskDragHandle;
  isDragging?: boolean;
};

const formatStatusLabel = (status: Task["status"]) => {
  if (status === "stopped") {
    return "Cancelled";
  }

  return status;
};

const TaskRowComponent = ({
  task,
  style,
  rowIndex,
  isSelected = false,
  mutationsAllowed = true,
  onSelect,
  rowRef,
  dragHandle,
  isDragging = false,
}: TaskRowProps) => {
  const pauseTask = useTaskStore((state) => state.pauseTask);
  const resumeTask = useTaskStore((state) => state.resumeTask);
  const cancelTask = useTaskStore((state) => state.cancelTask);
  const removeTask = useTaskStore((state) => state.removeTask);
  const removeTaskWithFiles = useTaskStore(
    (state) => state.removeTaskWithFiles,
  );
  const retryTask = useTaskStore((state) => state.retryTask);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<TorrentMetadata | null>(null);
  const [deleteWithFilesDialogOpen, setDeleteWithFilesDialogOpen] =
    useState(false);
  const deletePrimaryActionRef = useRef<HTMLButtonElement>(null);
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null);

  const progressLabel = `${Math.round(task.progress_percent)}%`;
  const progressPercent = Math.round(task.progress_percent);
  const renderedSourceUri = displayUrl(task.source_uri);
  const showDetails = task.is_torrent && task.torrent_info_hash;
  const statusLabel = formatStatusLabel(task.status);
  const showQueuePosition =
    task.status === "waiting" && typeof task.queue_position === "number";
  const statusVariant =
    task.status === "error"
      ? "destructive"
      : task.status === "paused" || task.status === "stopped"
        ? "outline"
        : "secondary";

  const handleOpen = async () => {
    try {
      await openTaskDestination(task.destination_path);
    } catch {
      window.alert("File/Folder not found");
    }
  };

  const handleDetails = async () => {
    if (!task.torrent_info_hash) {
      return;
    }
    if (details) {
      setDetailsOpen(true);
      return;
    }
    setDetailsLoading(true);
    try {
      const metadata = await fetchStoredTorrentMetadata(task.torrent_info_hash);
      setDetails(metadata);
      setDetailsOpen(true);
    } catch {
      window.alert("Torrent metadata not available");
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("button, a, input, select, textarea")
    ) {
      return;
    }

    onSelect?.(event);
  };

  const handleDeleteWithFiles = () => {
    deleteRestoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDeleteWithFilesDialogOpen(true);
  };

  return (
    <>
      <div
        ref={rowRef}
        data-testid={`task-row-${task.id}`}
        role="row"
        aria-rowindex={rowIndex}
        aria-selected={isSelected}
        style={style}
        className={cn(
          "grid grid-cols-[minmax(0,1.45fr)_minmax(84px,auto)_minmax(132px,1fr)_auto] items-center gap-3 border-b px-4 py-3",
          "transform-gpu transition-[background-color,border-color,box-shadow,transform] motion-safe:hover:translate-x-0.5",
          isSelected
            ? "border-ring/50 bg-accent shadow-[inset_3px_0_0_var(--ring)]"
            : "border-border hover:bg-muted/45",
          isDragging && "z-10 bg-card shadow-lg",
        )}
        onClick={handleRowClick}
      >
        <div
          role="gridcell"
          aria-label={`Filename: ${task.display_name}`}
          className="flex min-w-0 items-start gap-3"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileDown aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {task.display_name}
            </p>
            <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Folder aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{task.destination_path}</span>
            </p>
            <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{renderedSourceUri}</span>
            </p>
          </div>
        </div>
        <div
          role="gridcell"
          className="flex min-w-0 flex-col items-center gap-1"
        >
          <Badge
            aria-label={`Status: ${statusLabel}`}
            variant={statusVariant}
            className="justify-center capitalize"
          >
            {statusLabel}
          </Badge>
          {showQueuePosition ? (
            <div className="flex items-center gap-1">
              {dragHandle ? (
                <button
                  type="button"
                  ref={dragHandle.setActivatorNodeRef}
                  aria-label={`Drag to reorder ${task.display_name}`}
                  title="Drag to reorder"
                  className="-ml-2 flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  {...dragHandle.attributes}
                  {...dragHandle.listeners}
                >
                  <GripVertical aria-hidden="true" />
                </button>
              ) : null}
              <span
                aria-label={`Queue position: ${task.queue_position}`}
                className="whitespace-nowrap text-xs font-medium text-muted-foreground"
              >
                Queue #{task.queue_position}
              </span>
            </div>
          ) : null}
        </div>
        <div
          role="gridcell"
          aria-label={`Progress: ${progressPercent} percent`}
          className="flex min-w-0 flex-col gap-1"
        >
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="task-progress-bar h-full rounded-full bg-primary"
              style={{ width: progressLabel }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="shrink-0 tabular-nums">{progressLabel}</span>
            <span className="flex min-w-0 items-center justify-end gap-2 truncate text-right tabular-nums">
              <span className="inline-flex min-w-0 items-center gap-1">
                <ArrowDownToLine
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
                <span className="truncate">
                  {formatSpeed(task.download_speed_bps)}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <ArrowUpFromLine
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                />
                <span className="truncate">
                  {formatSpeed(task.upload_speed_bps)}
                </span>
              </span>
            </span>
          </div>
          <div className="truncate text-xs tabular-nums text-muted-foreground">
            {task.downloaded_bytes.toLocaleString()} /{" "}
            {task.total_bytes.toLocaleString()} B
          </div>
        </div>
        <div role="gridcell" aria-label={`Actions for ${task.display_name}`}>
          <TaskRowActions
            task={task}
            hasDetails={Boolean(showDetails)}
            detailsLoading={detailsLoading}
            mutationsAllowed={mutationsAllowed}
            onOpen={handleOpen}
            onDetails={handleDetails}
            onPause={() => pauseTask(task.id)}
            onResume={() => resumeTask(task.id)}
            onCancel={() => cancelTask(task.id)}
            onRetry={() => retryTask(task.id)}
            onDelete={() => removeTask(task.id)}
            onDeleteWithFiles={handleDeleteWithFiles}
          />
        </div>
      </div>
      <Dialog
        open={deleteWithFilesDialogOpen}
        onOpenChange={setDeleteWithFilesDialogOpen}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            deletePrimaryActionRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            deleteRestoreFocusRef.current?.focus();
            deleteRestoreFocusRef.current = null;
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete downloaded files?</DialogTitle>
            <DialogDescription>
              Move downloaded files for {task.display_name} to the OS trash and
              remove this task from History.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteWithFilesDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              ref={deletePrimaryActionRef}
              type="button"
              data-primary-action="true"
              variant="destructive"
              onClick={() => {
                setDeleteWithFilesDialogOpen(false);
                void removeTaskWithFiles(task.id);
              }}
            >
              Move files to trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {detailsOpen && details ? (
        <TorrentDetails
          metadata={details}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </>
  );
};

export const TaskRow = memo(TaskRowComponent);
