import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import type { Task } from "@/shared/lib/types";
import { TaskList } from "./TaskList";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 72,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: String(i),
        start: i * 72,
        size: 72,
      })),
  }),
}));

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

describe("TaskList", () => {
  it("renders an empty state when no tasks", () => {
    render(
      <MemoryRouter>
        <TaskList tasks={[]} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /no downloads/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/url \/ magnet \/ torrent/i)).toBeInTheDocument();
  });

  it("renders task rows with display names", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "First Task" }),
      createTask({
        id: "task-2",
        display_name: "Second Task",
        progress_percent: 87,
        status: "paused",
      }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    expect(screen.getByText("First Task")).toBeInTheDocument();
    expect(screen.getByText("Second Task")).toBeInTheDocument();
  });

  it("exposes virtualized rows with grid semantics and absolute row indices", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "First Task" }),
      createTask({
        id: "task-2",
        display_name: "Second Task",
        progress_percent: 87,
        status: "paused",
      }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    expect(
      screen.getByRole("grid", { name: /active downloads/i }),
    ).toHaveAttribute("aria-rowcount", "2");
    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "role",
      "row",
    );
    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "aria-rowindex",
      "1",
    );
    expect(screen.getByLabelText("Filename: First Task")).toBeInTheDocument();
    expect(screen.getByLabelText("Progress: 42 percent")).toBeInTheDocument();
    expect(screen.getByLabelText("Status: active")).toBeInTheDocument();
  });

  it("selects a row with a regular click", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "First Task" }),
      createTask({ id: "task-2", display_name: "Second Task" }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    fireEvent.click(screen.getByTestId("task-row-task-1"));

    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("task-row-task-2")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("toggles rows with Ctrl+Click without clearing the existing selection", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "First Task" }),
      createTask({ id: "task-2", display_name: "Second Task" }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    fireEvent.click(screen.getByTestId("task-row-task-1"));
    fireEvent.click(screen.getByTestId("task-row-task-2"), { ctrlKey: true });

    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("task-row-task-2")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByTestId("task-row-task-1"), { ctrlKey: true });

    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByTestId("task-row-task-2")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects a contiguous range with Shift+Click", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "First Task" }),
      createTask({ id: "task-2", display_name: "Second Task" }),
      createTask({ id: "task-3", display_name: "Third Task" }),
      createTask({ id: "task-4", display_name: "Fourth Task" }),
    ];

    render(<TaskList tasks={tasks} height={320} />);

    fireEvent.click(screen.getByTestId("task-row-task-1"));
    fireEvent.click(screen.getByTestId("task-row-task-3"), { shiftKey: true });

    expect(screen.getByTestId("task-row-task-1")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("task-row-task-2")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("task-row-task-3")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("task-row-task-4")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("renders a drag handle for each waiting task when reordering is enabled", () => {
    const tasks = [
      createTask({
        id: "task-1",
        display_name: "First Task",
        status: "waiting",
        queue_position: 1,
      }),
      createTask({
        id: "task-2",
        display_name: "Second Task",
        status: "waiting",
        queue_position: 2,
      }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    expect(
      screen.getAllByRole("button", { name: /drag to reorder/i }),
    ).toHaveLength(2);
  });

  it("hides drag handles when mutations are unavailable", () => {
    const tasks = [
      createTask({
        id: "task-1",
        display_name: "First Task",
        status: "waiting",
        queue_position: 1,
      }),
      createTask({
        id: "task-2",
        display_name: "Second Task",
        status: "waiting",
        queue_position: 2,
      }),
    ];

    render(<TaskList tasks={tasks} height={160} mutationsAllowed={false} />);

    expect(
      screen.queryByRole("button", { name: /drag to reorder/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render a drag handle when only one task is waiting", () => {
    const tasks = [
      createTask({
        id: "task-1",
        display_name: "First Task",
        status: "waiting",
        queue_position: 1,
      }),
      createTask({
        id: "task-2",
        display_name: "Second Task",
        status: "active",
      }),
    ];

    render(<TaskList tasks={tasks} height={160} />);

    expect(
      screen.queryByRole("button", { name: /drag to reorder/i }),
    ).not.toBeInTheDocument();
  });
});
