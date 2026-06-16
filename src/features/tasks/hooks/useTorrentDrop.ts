import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export type TorrentDropState = {
  isDragging: boolean;
  lastDroppedPath: string | null;
};

export type TorrentDropOptions = {
  onDrop: (path: string) => void;
};

const isTorrentFile = (path: string) => path.toLowerCase().endsWith(".torrent");

// Ref: https://v2.tauri.app/reference/javascript/api/namespacewebviewwindow
export const useTorrentDrop = ({
  onDrop,
}: TorrentDropOptions): TorrentDropState => {
  const [isDragging, setIsDragging] = useState(false);
  const [lastDroppedPath, setLastDroppedPath] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const attach = async () => {
      const tauriInternals = (
        window as Window & {
          __TAURI_INTERNALS__?: {
            metadata?: { currentWebview?: { label: string } };
          };
        }
      ).__TAURI_INTERNALS__;
      if (
        typeof window === "undefined" ||
        !tauriInternals?.metadata?.currentWebview
      ) {
        return;
      }
      const webview = getCurrentWebview();
      unlisten = await webview.onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "over") {
          setIsDragging(true);
          return;
        }
        if (payload.type === "leave") {
          setIsDragging(false);
          return;
        }
        if (payload.type === "drop") {
          setIsDragging(false);
          const torrentPath = payload.paths.find(isTorrentFile);
          if (torrentPath) {
            setLastDroppedPath(torrentPath);
            onDrop(torrentPath);
          }
        }
      });
    };

    void attach();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [onDrop]);

  return { isDragging, lastDroppedPath };
};
