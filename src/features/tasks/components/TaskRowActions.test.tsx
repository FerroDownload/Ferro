import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/shared/lib/types";
import { TaskRowActions } from "./TaskRowActions";

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active",
  progress_percent: 42,
  downloaded_bytes: 420,
  total_bytes: 1000,
  download_speed_bps: 0,
  upload_speed_bps: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
  uploaded_bytes: 0,
  orphan_imported: false,
  error_message: null,
  is_torrent: false,
  torrent_info_hash: null,
  selected_files: null,
  ...overrides,
});

const renderActions = (task: Task, mutationsAllowed = true) => {
  const handlers = {
    onOpen: vi.fn(),
    onDetails: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    onDelete: vi.fn(),
    onDeleteWithFiles: vi.fn(),
  };

  render(
    <TaskRowActions
      task={task}
      hasDetails={Boolean(task.is_torrent && task.torrent_info_hash)}
      detailsLoading={false}
      mutationsAllowed={mutationsAllowed}
      {...handlers}
    />,
  );

  return handlers;
};

describe("TaskRowActions", () => {
  it("disables active-task mutation actions when the engine is unavailable", async () => {
    const handlers = renderActions(createTask({ status: "active" }), false);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Open" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(handlers.onPause).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("disables history mutation actions when the engine is unavailable", async () => {
    const handlers = renderActions(createTask({ status: "error" }), false);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete with files" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(handlers.onRetry).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("keeps mutation actions enabled while the engine is running", async () => {
    const handlers = renderActions(createTask({ status: "paused" }));
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(handlers.onResume).toHaveBeenCalledTimes(1);
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });
});
