import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const COLLISION_NOTICE_EVENT = "download:collision_notice";
const TRACKER_REFRESH_FAILED_EVENT = "tracker:refresh_failed";
const ENGINE_CRASH_EVENT = "engine:crashed";
const ENGINE_SESSION_RECOVERED_EVENT = "engine:session_recovered";

type CollisionNoticePayload = {
  message?: string;
};

type TrackerRefreshFailedPayload = {
  reason?: string;
};

type EngineCrashPayload = {
  message?: string;
  restarted?: boolean;
};

type EngineSessionRecoveredPayload = {
  message?: string;
  backupPath?: string;
};

const fallbackMessage =
  "Download was not created because a file already exists.";
const trackerRefreshFailedMessage =
  "Tracker list refresh failed — using cached list.";
const engineCrashFallbackMessage = "Download engine restarted after crash.";
const engineSessionRecoveredFallbackMessage =
  "Download session could not be loaded. A fresh session was created; active downloads will be recovered from the engine.";

export const ToastProvider = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;
    let unlisteners: UnlistenFn[] = [];

    const register = async () => {
      const cleanups = await Promise.all([
        listen<CollisionNoticePayload>(COLLISION_NOTICE_EVENT, (event) => {
          setMessage(event.payload.message?.trim() || fallbackMessage);
        }),
        listen<TrackerRefreshFailedPayload>(
          TRACKER_REFRESH_FAILED_EVENT,
          () => {
            setMessage(trackerRefreshFailedMessage);
          },
        ),
        listen<EngineCrashPayload>(ENGINE_CRASH_EVENT, (event) => {
          setMessage(
            event.payload.message?.trim() || engineCrashFallbackMessage,
          );
        }),
        listen<EngineSessionRecoveredPayload>(
          ENGINE_SESSION_RECOVERED_EVENT,
          (event) => {
            setMessage(
              event.payload.message?.trim() ||
                engineSessionRecoveredFallbackMessage,
            );
          },
        ),
      ]);

      if (isMounted) {
        unlisteners = cleanups;
      } else {
        cleanups.forEach((cleanup) => cleanup());
      }
    };

    void register();

    return () => {
      isMounted = false;
      unlisteners.forEach((cleanup) => cleanup());
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-xl dark:border-amber-900/70 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1">{message}</p>
        <button
          type="button"
          aria-label="Dismiss notification"
          className="rounded border border-transparent px-2 text-amber-800 hover:border-amber-300 hover:bg-amber-100 dark:text-amber-100/80 dark:hover:border-amber-800 dark:hover:bg-amber-950/60"
          onClick={() => setMessage(null)}
        >
          x
        </button>
      </div>
    </div>
  );
};
