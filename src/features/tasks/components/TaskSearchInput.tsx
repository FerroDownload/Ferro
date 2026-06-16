import { forwardRef, useId } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { Task } from "@/shared/lib/types";

type TaskSearchInputProps = {
  query: string;
  onQueryChange: (query: string) => void;
  label?: string;
  variant?: "panel" | "inline";
};

export const filterTasksBySearchQuery = (tasks: Task[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return tasks;
  }

  return tasks.filter((task) => {
    const displayName = task.display_name.toLowerCase();
    const sourceUri = task.source_uri.toLowerCase();

    return (
      displayName.includes(normalizedQuery) ||
      sourceUri.includes(normalizedQuery)
    );
  });
};

export const NoTaskSearchMatches = ({ query }: { query: string }) => (
  <div className="rounded-md border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
    No tasks match "{query}"
  </div>
);

export const TaskSearchInput = forwardRef<
  HTMLInputElement,
  TaskSearchInputProps
>(
  (
    { query, onQueryChange, label = "Search downloads", variant = "panel" },
    ref,
  ) => {
    const inputId = useId();
    const isInline = variant === "inline";

    return (
      <form
        role="search"
        className={isInline ? "min-w-[260px] flex-1" : "flex flex-col gap-1"}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor={inputId}
            className={
              isInline ? "sr-only" : "text-xs font-medium text-muted-foreground"
            }
          >
            {label}
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              data-icon="inline-start"
            />
            <Input
              ref={ref}
              id={inputId}
              type="search"
              name={inputId}
              autoComplete="off"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Filename or URL"
              className="pl-8"
            />
          </div>
        </div>
      </form>
    );
  },
);

TaskSearchInput.displayName = "TaskSearchInput";
