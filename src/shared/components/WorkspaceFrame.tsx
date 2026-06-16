import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  WorkspaceHeader,
  type WorkspaceStat,
} from "@/shared/components/WorkspaceHeader";

type WorkspaceFrameProps = {
  title: string;
  stats?: WorkspaceStat[];
  actions?: ReactNode;
  controls?: ReactNode;
  controlsLabel?: string;
  contentLabel: string;
  aside?: ReactNode;
  children: ReactNode;
};

export const WorkspaceFrame = ({
  title,
  stats,
  actions,
  controls,
  controlsLabel = "Workspace controls",
  contentLabel,
  aside,
  children,
}: WorkspaceFrameProps) => (
  <section className="flex min-h-0 flex-1 flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-150">
    <div className="border-b border-border/80 pb-3">
      <WorkspaceHeader title={title} stats={stats} actions={actions} />
    </div>
    {controls ? (
      <Card
        role="group"
        aria-label={controlsLabel}
        className="rounded-md bg-card/95 shadow-sm"
      >
        <CardContent className="flex min-h-12 flex-wrap items-center gap-2 p-2.5">
          {controls}
        </CardContent>
      </Card>
    ) : null}
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section
        aria-label={contentLabel}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {children}
      </section>
      {aside}
    </div>
  </section>
);
