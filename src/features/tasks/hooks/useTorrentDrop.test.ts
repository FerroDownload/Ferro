import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTorrentDrop } from "./useTorrentDrop";

const mockOnDragDropEvent = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: mockOnDragDropEvent,
  }),
}));

describe("useTorrentDrop", () => {
  beforeEach(() => {
    mockOnDragDropEvent.mockReset();
    (
      window as Window & {
        __TAURI_INTERNALS__?: {
          metadata?: { currentWebview?: { label: string } };
        };
      }
    ).__TAURI_INTERNALS__ = {
      metadata: {
        currentWebview: { label: "main" },
      },
    };
  });

  it("tracks drag over state", async () => {
    const onDrop = vi.fn();
    let handler: (event: {
      payload: { type: string; paths: string[] };
    }) => void;

    mockOnDragDropEvent.mockImplementation(async (callback) => {
      handler = callback;
      return vi.fn();
    });

    const { result } = renderHook(() => useTorrentDrop({ onDrop }));

    await act(async () => {
      handler!({ payload: { type: "over", paths: [] } });
    });

    expect(result.current.isDragging).toBe(true);
  });

  it("fires on drop for torrent file", async () => {
    const onDrop = vi.fn();
    let handler: (event: {
      payload: { type: string; paths: string[] };
    }) => void;

    mockOnDragDropEvent.mockImplementation(async (callback) => {
      handler = callback;
      return vi.fn();
    });

    const { result } = renderHook(() => useTorrentDrop({ onDrop }));

    await act(async () => {
      handler!({
        payload: {
          type: "drop",
          paths: [
            "C:/Users/Test/Downloads/readme.txt",
            "C:/Users/Test/Downloads/file.torrent",
          ],
        },
      });
    });

    expect(onDrop).toHaveBeenCalledWith("C:/Users/Test/Downloads/file.torrent");
    expect(result.current.lastDroppedPath).toBe(
      "C:/Users/Test/Downloads/file.torrent",
    );
  });

  it("ignores non-torrent drops", async () => {
    const onDrop = vi.fn();
    let handler: (event: {
      payload: { type: string; paths: string[] };
    }) => void;

    mockOnDragDropEvent.mockImplementation(async (callback) => {
      handler = callback;
      return vi.fn();
    });

    renderHook(() => useTorrentDrop({ onDrop }));

    await act(async () => {
      handler!({
        payload: {
          type: "drop",
          paths: ["C:/Users/Test/Downloads/readme.txt"],
        },
      });
    });

    expect(onDrop).not.toHaveBeenCalled();
  });
});
