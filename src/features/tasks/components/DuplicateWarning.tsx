import { displayUrl } from "@/features/tasks/utils/displayUrl";

type DuplicateWarningProps = {
  title: string;
  url: string;
};

export const DuplicateWarning = ({ title, url }: DuplicateWarningProps) => {
  const renderedUrl = displayUrl(url);

  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100"
      role="status"
    >
      <p className="font-semibold">Already in your active downloads</p>
      <p className="min-w-0 truncate text-amber-800 dark:text-amber-100/80">
        {title}
      </p>
      <p className="min-w-0 truncate text-amber-800 dark:text-amber-100/80">
        {renderedUrl}
      </p>
    </div>
  );
};
