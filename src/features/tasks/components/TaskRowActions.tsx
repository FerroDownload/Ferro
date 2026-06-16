import {
  Ban,
  FolderOpen,
  FolderX,
  Info,
  type LucideIcon,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Task } from "@/shared/lib/types";

type TaskRowActionsProps = {
  task: Task;
  hasDetails: boolean;
  detailsLoading: boolean;
  mutationsAllowed?: boolean;
  onOpen: () => void;
  onDetails: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onDeleteWithFiles: () => void;
};

const stopEligibleStatuses: Task["status"][] = ["active", "paused", "waiting"];
const historyStatuses: Task["status"][] = ["complete", "stopped", "error"];

type RowActionProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "outline" | "secondary" | "destructive";
};

// Icon-only actions keep the fixed-height row compact so it never overflows or
// wraps as the window narrows; the label is exposed via aria-label + tooltip.
const RowAction = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  variant = "outline",
}: RowActionProps) => (
  <Button
    type="button"
    variant={variant}
    size="icon"
    aria-label={label}
    title={label}
    onClick={onClick}
    disabled={disabled}
  >
    <Icon aria-hidden="true" />
  </Button>
);

export const TaskRowActions = ({
  task,
  hasDetails,
  detailsLoading,
  mutationsAllowed = true,
  onOpen,
  onDetails,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onDeleteWithFiles,
}: TaskRowActionsProps) => {
  const showPause = task.status === "active";
  const showResume = task.status === "paused";
  const showCancel = stopEligibleStatuses.includes(task.status);
  const showDelete = historyStatuses.includes(task.status);
  const showRetry = task.status === "error";

  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <RowAction icon={FolderOpen} label="Open" onClick={onOpen} />
      {hasDetails ? (
        <RowAction
          icon={Info}
          label="Details"
          onClick={onDetails}
          disabled={detailsLoading}
        />
      ) : null}
      {showPause ? (
        <RowAction
          icon={Pause}
          label="Pause"
          onClick={onPause}
          disabled={!mutationsAllowed}
        />
      ) : null}
      {showResume ? (
        <RowAction
          icon={Play}
          label="Resume"
          onClick={onResume}
          disabled={!mutationsAllowed}
        />
      ) : null}
      {showCancel ? (
        <RowAction
          icon={Ban}
          label="Cancel"
          onClick={onCancel}
          disabled={!mutationsAllowed}
        />
      ) : null}
      {showDelete ? (
        <>
          {showRetry ? (
            <RowAction
              icon={RotateCcw}
              label="Retry"
              variant="secondary"
              onClick={onRetry}
              disabled={!mutationsAllowed}
            />
          ) : null}
          <RowAction
            icon={Trash2}
            label="Delete"
            variant="destructive"
            onClick={onDelete}
            disabled={!mutationsAllowed}
          />
          <RowAction
            icon={FolderX}
            label="Delete with files"
            variant="destructive"
            onClick={onDeleteWithFiles}
            disabled={!mutationsAllowed}
          />
        </>
      ) : null}
    </div>
  );
};
