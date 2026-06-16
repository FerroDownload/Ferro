import type { Engine } from "@/shared/lib/types";

type EngineFailedViewProps = {
  engine: Engine | null;
  onRetry: () => void | Promise<void>;
  onOpenLogsFolder: () => void | Promise<void>;
};

export const EngineFailedView = ({
  engine,
  onRetry,
  onOpenLogsFolder,
}: EngineFailedViewProps) => {
  if (engine?.process_state !== "engine_failed") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">
            Download engine failed to start after 3 attempts
          </p>
          {engine.last_error_message ? (
            <p className="break-words text-rose-800 dark:text-rose-100/80">
              {engine.last_error_message}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-destructive px-3 py-2 font-semibold text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              void onRetry();
            }}
          >
            Retry
          </button>
          <button
            type="button"
            className="rounded-md border border-rose-200 bg-card px-3 py-2 font-semibold text-rose-900 hover:border-rose-400 hover:bg-rose-100 dark:border-rose-900/70 dark:bg-transparent dark:text-rose-100 dark:hover:bg-rose-950/60"
            onClick={() => {
              void onOpenLogsFolder();
            }}
          >
            Open logs folder
          </button>
        </div>
      </div>
    </div>
  );
};
