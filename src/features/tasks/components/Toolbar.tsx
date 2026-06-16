import { Pause, Play, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type ToolbarProps = {
  mutationsAllowed?: boolean;
  onNewDownload: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
};

export const Toolbar = ({
  mutationsAllowed = true,
  onNewDownload,
  onPauseAll,
  onResumeAll,
}: ToolbarProps) => (
  <div className="flex flex-wrap items-center justify-end gap-2">
    <Button
      variant="outline"
      size="sm"
      onClick={onPauseAll}
      disabled={!mutationsAllowed}
    >
      <Pause aria-hidden="true" data-icon="inline-start" />
      Pause all
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={onResumeAll}
      disabled={!mutationsAllowed}
    >
      <Play aria-hidden="true" data-icon="inline-start" />
      Resume all
    </Button>
    <Button size="sm" onClick={onNewDownload} disabled={!mutationsAllowed}>
      <Plus aria-hidden="true" data-icon="inline-start" />
      New download
    </Button>
  </div>
);
