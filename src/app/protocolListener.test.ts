import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerProtocolListener } from "./protocolListener";

const {
  getCurrentMock,
  listenMock,
  onOpenUrlMock,
  unlistenCustomMock,
  unlistenDeepLinkMock,
} = vi.hoisted(() => ({
  getCurrentMock: vi.fn(),
  listenMock: vi.fn(),
  onOpenUrlMock: vi.fn(),
  unlistenCustomMock: vi.fn(),
  unlistenDeepLinkMock: vi.fn(),
}));

let openUrlHandler: ((urls: string[]) => void) | null = null;
let customEventHandler: ((event: { payload: { url: string } }) => void) | null =
  null;

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: getCurrentMock,
  onOpenUrl: onOpenUrlMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

describe("registerProtocolListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openUrlHandler = null;
    customEventHandler = null;
    getCurrentMock.mockResolvedValue(null);
    onOpenUrlMock.mockImplementation((handler: (urls: string[]) => void) => {
      openUrlHandler = handler;
      return Promise.resolve(unlistenDeepLinkMock);
    });
    listenMock.mockImplementation(
      (
        _eventName: string,
        handler: (event: { payload: { url: string } }) => void,
      ) => {
        customEventHandler = handler;
        return Promise.resolve(unlistenCustomMock);
      },
    );
  });

  it("opens startup magnet links reported by the Tauri deep-link plugin", async () => {
    const onMagnetLink = vi.fn();
    getCurrentMock.mockResolvedValue(["magnet:?xt=urn:btih:abcdef"]);

    await registerProtocolListener(onMagnetLink);

    expect(onMagnetLink).toHaveBeenCalledWith("magnet:?xt=urn:btih:abcdef");
  });

  it("deduplicates official and Rust-emitted events for the same magnet URI", async () => {
    const onMagnetLink = vi.fn();

    await registerProtocolListener(onMagnetLink);
    openUrlHandler?.(["magnet:?xt=urn:btih:abcdef"]);
    customEventHandler?.({
      payload: { url: "magnet:?xt=urn:btih:abcdef" },
    });

    expect(onMagnetLink).toHaveBeenCalledTimes(1);
    expect(onMagnetLink).toHaveBeenCalledWith("magnet:?xt=urn:btih:abcdef");
  });

  it("returns a cleanup function for both listener sources", async () => {
    const cleanup = await registerProtocolListener(vi.fn());

    cleanup();

    expect(unlistenDeepLinkMock).toHaveBeenCalledTimes(1);
    expect(unlistenCustomMock).toHaveBeenCalledTimes(1);
  });
});
