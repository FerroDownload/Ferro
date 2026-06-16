type RestartBannerProps = {
  restartAttempts: number;
  hidden?: boolean;
};

export const RestartBanner = ({
  restartAttempts,
  hidden = false,
}: RestartBannerProps) => {
  if (hidden) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <p className="font-semibold">Download engine is restarting</p>
      <p className="mt-1 text-amber-800 dark:text-amber-100/80">
        Attempt {Math.min(Math.max(restartAttempts, 1), 3)} of 3. Download
        controls will be available after the engine reconnects.
      </p>
    </div>
  );
};
