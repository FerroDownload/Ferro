import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export type WorkspaceStat = {
  label: string;
  value: number;
};

type WorkspaceHeaderProps = {
  title: string;
  stats?: WorkspaceStat[];
  actions?: ReactNode;
};

export const WorkspaceHeader = ({
  title,
  stats = [],
  actions,
}: WorkspaceHeaderProps) => (
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold leading-tight text-foreground text-balance">
        {title}
      </h1>
      {stats.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-1.5">
          {stats.map((stat) => (
            <Badge
              key={stat.label}
              variant="secondary"
              className="gap-1.5 font-medium"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary/70"
              />
              <dt className="sr-only">{stat.label}</dt>
              <dd className="tabular-nums">
                {stat.value} {stat.label}
              </dd>
            </Badge>
          ))}
        </dl>
      ) : null}
    </div>
    {actions ? <div className="shrink-0">{actions}</div> : null}
  </header>
);
