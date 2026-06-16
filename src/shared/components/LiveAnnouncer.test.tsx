import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LiveAnnouncer, type TaskProgressAnnouncement } from "./LiveAnnouncer";

type EventCallback = (event: { payload: unknown }) => void;

let taskStateChangedCallback: EventCallback | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: EventCallback) => {
    if (eventName === "task:state_changed") {
      taskStateChangedCallback = callback;
    }
    return Promise.resolve(() => {
      taskStateChangedCallback = null;
    });
  }),
}));

describe("LiveAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    taskStateChangedCallback = null;
  });

  it("renders a polite live region", () => {
    render(<LiveAnnouncer />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("announces task state transitions immediately", async () => {
    render(<LiveAnnouncer />);
    await vi.runOnlyPendingTimersAsync();

    act(() => {
      taskStateChangedCallback?.({
        payload: {
          task_id: "task-1",
          display_name: "Example File",
          old_status: "active",
          new_status: "complete",
        },
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Example File completed",
    );
  });

  it("rate-limits numeric progress announcements per task", () => {
    const { rerender } = render(
      <LiveAnnouncer
        progressAnnouncements={[
          {
            taskId: "task-1",
            displayName: "Example File",
            progressPercent: 10,
          },
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Example File is 10 percent complete",
    );

    rerender(
      <LiveAnnouncer
        progressAnnouncements={[
          {
            taskId: "task-1",
            displayName: "Example File",
            progressPercent: 11,
          },
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Example File is 10 percent complete",
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    rerender(
      <LiveAnnouncer
        progressAnnouncements={[
          {
            taskId: "task-1",
            displayName: "Example File",
            progressPercent: 12,
          } satisfies TaskProgressAnnouncement,
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Example File is 12 percent complete",
    );
  });
});
