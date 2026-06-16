import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useModalFocusTrap } from "@/shared/hooks/useModalFocusTrap";
import type { TorrentMetadata } from "@/shared/lib/types";

type TorrentFilePickerProps = {
  metadata: TorrentMetadata;
  destination: string;
  onConfirm: (payload: {
    selectedFiles: string[];
    selectedIndices: number[];
  }) => void;
  onCancel: () => void;
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  if (value >= 1024 ** 3) {
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
  }
  if (value >= 1024 ** 2) {
    return `${(value / 1024 ** 2).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }
  return `${value} B`;
};

export const TorrentFilePicker = ({
  metadata,
  destination,
  onConfirm,
  onCancel,
}: TorrentFilePickerProps) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>(() =>
    metadata.files.filter((file) => file.selected).map((file) => file.index),
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocusTrap(dialogRef, {
    initialFocusSelector: "[data-primary-action='true']",
    onEscape: onCancel,
  });

  const selectedFiles = useMemo(() => {
    const set = new Set(selectedIndices);
    return metadata.files
      .filter((file) => set.has(file.index))
      .map((file) => file.path);
  }, [metadata.files, selectedIndices]);

  const selectedBytes = useMemo(() => {
    const set = new Set(selectedIndices);
    return metadata.files
      .filter((file) => set.has(file.index))
      .reduce((total, file) => total + file.bytes, 0);
  }, [metadata.files, selectedIndices]);

  const toggleIndex = (index: number) => {
    setSelectedIndices((current) =>
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index],
    );
  };

  const handleSelectAll = () => {
    setSelectedIndices(metadata.files.map((file) => file.index));
  };

  const handleSelectNone = () => {
    setSelectedIndices([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 px-4 py-6 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="torrent-file-picker-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col rounded-md border border-border bg-card p-6 text-card-foreground shadow-xl"
      >
        <header className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Torrent selection
          </p>
          <h2 id="torrent-file-picker-title" className="text-xl font-semibold">
            Select files to download
          </h2>
          <p className="text-sm text-muted-foreground">
            {metadata.name} · {formatBytes(metadata.total_bytes)}
          </p>
          <p className="text-xs text-muted-foreground">
            Save to: {destination}
          </p>
        </header>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={handleSelectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={handleSelectNone}
          >
            Select none
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            {selectedFiles.length} files · {formatBytes(selectedBytes)}
          </span>
        </div>

        <ScrollArea className="mt-4 min-h-0 max-h-80 flex-1 rounded-md border border-border bg-background">
          <div className="flex flex-col gap-2 p-3">
            {metadata.files.map((file) => (
              <div
                key={file.index}
                className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted/50"
              >
                <Checkbox
                  id={`torrent-file-${file.index}`}
                  checked={selectedIndices.includes(file.index)}
                  onCheckedChange={() => toggleIndex(file.index)}
                  aria-label={`Select ${file.path}`}
                  className="size-5"
                />
                <label
                  htmlFor={`torrent-file-${file.index}`}
                  className="min-w-0 cursor-pointer truncate"
                >
                  {file.path}
                </label>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(file.bytes)}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-primary-action="true"
            className="h-11"
            onClick={() =>
              onConfirm({
                selectedFiles,
                selectedIndices,
              })
            }
            disabled={selectedIndices.length === 0}
          >
            Add torrent
          </Button>
        </div>
      </div>
    </div>
  );
};
