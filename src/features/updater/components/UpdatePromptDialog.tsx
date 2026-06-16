import type { UpdateDownloadProgress, UpdateInfo } from "@/shared/lib/types";

type UpdatePromptDialogProps = {
  update: UpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  isInstalling: boolean;
  onConfirm: () => void | Promise<void>;
  onDismiss: () => void;
};

export const UpdatePromptDialog = ({
  update,
  progress,
  isInstalling,
  onConfirm,
  onDismiss,
}: UpdatePromptDialogProps) => {
  if (!update) {
    return null;
  }

  const progressValue = Math.round(progress?.percent ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 px-4 py-6 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-prompt-title"
        className="w-full max-w-md rounded-md border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            Update available
          </p>
          <div className="space-y-1">
            <h2 id="update-prompt-title" className="text-xl font-semibold">
              Ferro {update.version}
            </h2>
            <p className="text-sm text-muted-foreground">
              Current version: {update.current_version}
            </p>
          </div>
          {update.notes ? (
            <p className="max-h-32 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
              {update.notes}
            </p>
          ) : null}
        </div>

        {progress ? (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Downloading update</span>
              <span>{progressValue}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressValue}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-sky-600"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:border-ring hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onDismiss}
            disabled={isInstalling}
          >
            Later
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void onConfirm();
            }}
            disabled={isInstalling}
          >
            {isInstalling ? "Installing..." : "Update now"}
          </button>
        </div>
      </section>
    </div>
  );
};
