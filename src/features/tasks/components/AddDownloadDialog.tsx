import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import type { Task } from "@/shared/lib/types";
import { DuplicateWarning } from "./DuplicateWarning";
import { findDuplicateTask, validateDownloadUrl } from "../lib/validators";

export type AddDownloadSubmission =
  | { kind: "url"; url: string; destination: string }
  | { kind: "torrent"; torrentPath: string; destination: string };

type AddDownloadDialogProps = {
  isOpen: boolean;
  tasks: Task[];
  initialUrl?: string;
  disabled?: boolean;
  onClose: () => void;
  onSubmit: (payload: AddDownloadSubmission) => Promise<void> | void;
};

export const AddDownloadDialog = ({
  isOpen,
  tasks,
  initialUrl,
  disabled = false,
  onClose,
  onSubmit,
}: AddDownloadDialogProps) => {
  const settings = useSettingsStore((state) => state.settings);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [destinationTouched, setDestinationTouched] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && !settings && !isLoading) {
      void loadSettings();
    }
  }, [isOpen, isLoading, loadSettings, settings]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setUrl(initialUrl ?? "");
    setError(null);
    setDestinationTouched(false);
    setDestination(settings?.download_directory ?? "");
  }, [initialUrl, isOpen, settings?.download_directory]);

  useEffect(() => {
    if (isOpen && !destinationTouched && settings?.download_directory) {
      setDestination(settings.download_directory);
    }
  }, [destinationTouched, isOpen, settings?.download_directory]);

  const duplicateTask = useMemo(
    () => findDuplicateTask(url, tasks),
    [url, tasks],
  );
  const showDuplicateWarning =
    settings?.duplicate_url_warning !== false && duplicateTask;

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (disabled) {
      return;
    }

    const result = validateDownloadUrl(url);
    if (!result.isValid) {
      setError(result.error);
      return;
    }

    setError(null);
    try {
      await onSubmit({
        kind: "url",
        url: url.trim(),
        destination: destination.trim(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unable to add download";
      setError(message);
    }
  };

  const handleTorrentBrowse = async () => {
    if (disabled) {
      return;
    }

    const selection = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Torrent files", extensions: ["torrent"] }],
    });
    const nextValue = Array.isArray(selection) ? selection[0] : selection;
    if (typeof nextValue !== "string") {
      return;
    }

    setError(null);
    try {
      await onSubmit({
        kind: "torrent",
        torrentPath: nextValue,
        destination: destination.trim(),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unable to add torrent";
      setError(message);
    }
  };

  const handleBrowse = async () => {
    const selection = await open({ directory: true, multiple: false });
    const nextValue = Array.isArray(selection) ? selection[0] : selection;
    if (typeof nextValue === "string") {
      setDestinationTouched(true);
      setDestination(nextValue);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-w-lg flex-col gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          urlInputRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocusRef.current?.focus();
          restoreFocusRef.current = null;
        }}
      >
        <DialogHeader className="gap-2 p-6 pb-0">
          <p className="text-xs font-medium text-muted-foreground">
            New download
          </p>
          <DialogTitle className="text-xl">Add download</DialogTitle>
          <DialogDescription>
            Paste a direct link, use a magnet link, or browse for a torrent
            file.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await handleSubmit();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="download-url">Download URL</Label>
              <Input
                ref={urlInputRef}
                id="download-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/file.zip"
                aria-invalid={Boolean(error)}
                className="h-11"
              />
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="download-destination">Save to</Label>
              <div className="flex gap-2">
                <Input
                  id="download-destination"
                  value={destination}
                  onChange={(event) => {
                    setDestinationTouched(true);
                    setDestination(event.target.value);
                  }}
                  placeholder="Choose a folder"
                  className="h-11"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={handleBrowse}
                  disabled={disabled}
                >
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You can update this later in Settings.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">
                  Torrent file
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose a `.torrent` file and continue to file selection before
                  starting the download.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-max"
                onClick={handleTorrentBrowse}
                disabled={disabled}
              >
                Browse torrent file
              </Button>
            </div>

            {showDuplicateWarning ? (
              <DuplicateWarning
                title={duplicateTask.display_name}
                url={duplicateTask.source_uri}
              />
            ) : null}
          </div>

          <DialogFooter className="p-6 pt-0">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-11" disabled={disabled}>
              Add download
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
