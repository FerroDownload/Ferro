import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import type { TaskStatus } from "@/shared/lib/types";

const PROGRESS_ANNOUNCEMENT_INTERVAL_MS = 2_000;

export type TaskProgressAnnouncement = {
  taskId: string;
  displayName: string;
  progressPercent: number;
};

type TaskStateChangedPayload = {
  task_id: string;
  display_name: string;
  old_status: TaskStatus;
  new_status: TaskStatus;
  error_message?: string | null;
};

type LiveAnnouncerProps = {
  progressAnnouncements?: TaskProgressAnnouncement[];
};

const statusAnnouncement = (payload: TaskStateChangedPayload): string => {
  if (payload.new_status === "complete") {
    return `${payload.display_name} completed`;
  }
  if (payload.new_status === "error") {
    return payload.error_message
      ? `${payload.display_name} failed: ${payload.error_message}`
      : `${payload.display_name} failed`;
  }
  if (payload.new_status === "stopped") {
    return `${payload.display_name} cancelled`;
  }

  return `${payload.display_name} is now ${payload.new_status}`;
};

export const LiveAnnouncer = ({
  progressAnnouncements = [],
}: LiveAnnouncerProps) => {
  const [message, setMessage] = useState("");
  const lastProgressAnnouncementAt = useRef(new Map<string, number>());
  const lastProgressPercent = useRef(new Map<string, number>());

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void Promise.resolve()
      .then(() =>
        listen<TaskStateChangedPayload>("task:state_changed", (event) => {
          if (!disposed) {
            setMessage(statusAnnouncement(event.payload));
          }
        }),
      )
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => {
        unlisten = null;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const now = Date.now();

    for (const progress of progressAnnouncements) {
      const roundedProgress = Math.round(progress.progressPercent);
      if (
        lastProgressPercent.current.get(progress.taskId) === roundedProgress
      ) {
        continue;
      }

      const lastAnnouncedAt =
        lastProgressAnnouncementAt.current.get(progress.taskId) ??
        Number.NEGATIVE_INFINITY;
      if (now - lastAnnouncedAt < PROGRESS_ANNOUNCEMENT_INTERVAL_MS) {
        continue;
      }

      lastProgressPercent.current.set(progress.taskId, roundedProgress);
      lastProgressAnnouncementAt.current.set(progress.taskId, now);
      setMessage(
        `${progress.displayName} is ${roundedProgress} percent complete`,
      );
    }
  }, [progressAnnouncements]);

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
};
