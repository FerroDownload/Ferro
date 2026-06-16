import { act, render, screen } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "./ToastProvider";

const listeners = new Map<string, (event: { payload: unknown }) => void>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    (eventName: string, callback: (event: { payload: unknown }) => void) => {
      listeners.set(eventName, callback);
      return Promise.resolve(() => listeners.delete(eventName));
    },
  ),
}));

describe("ToastProvider", () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  it("renders collision notices emitted by the backend", async () => {
    render(<ToastProvider />);

    await vi.waitFor(() => {
      expect(listeners.has("download:collision_notice")).toBe(true);
    });

    act(() => {
      listeners.get("download:collision_notice")?.({
        payload: {
          type: "blocked",
          kind: "skipped_single_file",
          path: "C:/Downloads/file.zip",
          message: "File already exists; skipped creating the download.",
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "File already exists; skipped creating the download.",
    );
  });

  it("renders manual tracker refresh failures emitted by the backend", async () => {
    render(<ToastProvider />);

    await vi.waitFor(() => {
      expect(listeners.has("tracker:refresh_failed")).toBe(true);
    });

    act(() => {
      listeners.get("tracker:refresh_failed")?.({
        payload: {
          reason: "network unavailable",
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Tracker list refresh failed",
    );
    expect(screen.getByRole("status")).toHaveTextContent("using cached list");
  });

  it("renders engine crash restart notices emitted by the backend", async () => {
    render(<ToastProvider />);

    await vi.waitFor(() => {
      expect(listeners.has("engine:crashed")).toBe(true);
    });

    act(() => {
      listeners.get("engine:crashed")?.({
        payload: {
          message: "Download engine restarted after crash",
          restarted: true,
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Download engine restarted after crash",
    );
  });

  it("renders engine session recovery notices emitted by the backend", async () => {
    render(<ToastProvider />);

    await vi.waitFor(() => {
      expect(listeners.has("engine:session_recovered")).toBe(true);
    });

    act(() => {
      listeners.get("engine:session_recovered")?.({
        payload: {
          message:
            "Download session could not be loaded. A fresh session was created; active downloads will be recovered from the engine.",
          backupPath: "C:/Ferro/aria2.session.corrupt.20260505T120000Z",
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "A fresh session was created",
    );
  });

  it("does not register a Tauri listener in non-Tauri test environments", () => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");

    render(<ToastProvider />);

    expect(listen).not.toHaveBeenCalled();
  });
});
