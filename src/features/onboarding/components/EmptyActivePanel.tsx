import { Link2, Plus, UploadCloud } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type EmptyActivePanelProps = {
  onAddDownload?: () => void;
  addDownloadDisabled?: boolean;
};

export const EmptyActivePanel = ({
  onAddDownload,
  addDownloadDisabled = false,
}: EmptyActivePanelProps) => (
  <div className="grid min-h-[360px] place-items-center px-4 py-8">
    <Card className="w-full max-w-xl rounded-md shadow-sm">
      <CardHeader className="flex-row items-center justify-between gap-3 p-4 pb-0">
        <CardTitle>
          <h2 className="text-lg">No downloads</h2>
        </CardTitle>
        <Badge variant="outline" className="gap-1.5">
          <Link2 aria-hidden="true" className="size-3.5" />
          URL / Magnet / Torrent
        </Badge>
      </CardHeader>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={onAddDownload}
          disabled={addDownloadDisabled}
          className="mt-4 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/35 text-sm font-medium text-muted-foreground transition hover:border-primary/60 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Open download input"
        >
          <UploadCloud aria-hidden="true" className="size-5" />
          Drop link or choose file
        </button>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            onClick={onAddDownload}
            disabled={addDownloadDisabled}
          >
            <Plus aria-hidden="true" data-icon="inline-start" />
            Add download
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);
