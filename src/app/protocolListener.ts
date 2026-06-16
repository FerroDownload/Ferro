import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

export const MAGNET_LINK_OPENED_EVENT = "protocol:magnet-opened";

type MagnetLinkPayload = {
  url: string;
};

export type ProtocolListenerCleanup = () => void;
export type ProtocolMagnetHandler = (url: string) => void;

export async function registerProtocolListener(
  onMagnetLink: ProtocolMagnetHandler,
): Promise<ProtocolListenerCleanup> {
  const seenUrls = new Set<string>();
  const openMagnetLink = (value: unknown) => {
    const url = normalizeMagnetUri(value);
    if (!url || seenUrls.has(url)) {
      return;
    }

    seenUrls.add(url);
    onMagnetLink(url);
  };

  const currentUrls = await getCurrent();
  currentUrls?.forEach(openMagnetLink);

  const unlistenDeepLink = await onOpenUrl((urls) => {
    urls.forEach(openMagnetLink);
  });
  const unlistenRustEvent: UnlistenFn = await listen<MagnetLinkPayload>(
    MAGNET_LINK_OPENED_EVENT,
    (event) => openMagnetLink(event.payload.url),
  );

  return () => {
    unlistenDeepLink();
    unlistenRustEvent();
  };
}

function normalizeMagnetUri(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const scheme = trimmed.slice(0, separatorIndex);
  if (scheme.toLowerCase() !== "magnet") {
    return null;
  }

  return `magnet:${trimmed.slice(separatorIndex + 1)}`;
}
