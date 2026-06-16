import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentWindowMock, invokeWindowCloseRequestedMock } = vi.hoisted(
  () => ({
    getCurrentWindowMock: vi.fn(),
    invokeWindowCloseRequestedMock: vi.fn(),
  }),
);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}));

vi.mock("@/shared/lib/tauri", () => ({
  invokeWindowCloseRequested: invokeWindowCloseRequestedMock,
}));

import { registerWindowCloseHandler } from "./windowEvents";

type CloseRequestedHandler = (event: {
  preventDefault: () => void;
}) => void | Promise<void>;

describe("registerWindowCloseHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("prevents the native close and delegates close-to-tray handling to Rust", async () => {
    const unlisten = vi.fn();
    const onCloseRequested = vi.fn<
      (handler: CloseRequestedHandler) => Promise<() => void>
    >(async () => unlisten);
    getCurrentWindowMock.mockReturnValue({ onCloseRequested });
    invokeWindowCloseRequestedMock.mockResolvedValue(undefined);

    const cleanup = await registerWindowCloseHandler();

    expect(onCloseRequested).toHaveBeenCalledTimes(1);
    const event = { preventDefault: vi.fn() };
    const handler = onCloseRequested.mock
      .calls[0]?.[0] as CloseRequestedHandler;
    await handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(invokeWindowCloseRequestedMock).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
