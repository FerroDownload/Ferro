import { useCallback, useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { invokeUpdaterDownloadAndInstall } from "@/shared/lib/tauri";
import type { UpdateDownloadProgress, UpdateInfo } from "@/shared/lib/types";
import { UpdatePromptDialog } from "./UpdatePromptDialog";

const UPDATE_AVAILABLE_EVENT = "update:available";
const UPDATE_DOWNLOAD_PROGRESS_EVENT = "update:download_progress";
const UPDATE_READY_EVENT = "update:ready";

export const UpdatePromptHost = () => {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [isInstalling, setInstalling] = useState(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;
    const unlisteners: UnlistenFn[] = [];

    const register = async () => {
      const unlistenAvailable = await listen<UpdateInfo>(
        UPDATE_AVAILABLE_EVENT,
        (event) => {
          setUpdate(event.payload);
          setProgress(null);
          setInstalling(false);
        },
      );
      const unlistenProgress = await listen<UpdateDownloadProgress>(
        UPDATE_DOWNLOAD_PROGRESS_EVENT,
        (event) => {
          setProgress(event.payload);
          setInstalling(true);
        },
      );
      const unlistenReady = await listen<{ version: string }>(
        UPDATE_READY_EVENT,
        () => {
          setInstalling(true);
        },
      );

      if (isMounted) {
        unlisteners.push(unlistenAvailable, unlistenProgress, unlistenReady);
      } else {
        unlistenAvailable();
        unlistenProgress();
        unlistenReady();
      }
    };

    void register();

    return () => {
      isMounted = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    setInstalling(true);
    try {
      await invokeUpdaterDownloadAndInstall();
    } catch (error) {
      setInstalling(false);
      const message =
        error instanceof Error ? error.message : "Unable to install update";
      window.alert(message);
    }
  }, []);

  return (
    <UpdatePromptDialog
      update={update}
      progress={progress}
      isInstalling={isInstalling}
      onConfirm={handleConfirm}
      onDismiss={() => setUpdate(null)}
    />
  );
};
