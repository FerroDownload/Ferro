import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { Task } from "@/shared/lib/types";
import { HistoryList } from "./HistoryList";

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
  status: "complete",
  progress_percent: 100,
  downloaded_bytes: 1000,
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

describe("HistoryList", () => {
  it("renders empty state when no history tasks", () => {
    render(<HistoryList tasks={[]} />);

    expect(screen.getByText(/no completed downloads yet/i)).toBeInTheDocument();
  });

  it("renders completed, stopped, and error tasks", () => {
    const tasks = [
      createTask({ id: "task-1", display_name: "Done", status: "complete" }),
      createTask({ id: "task-2", display_name: "Stopped", status: "stopped" }),
      createTask({ id: "task-3", display_name: "Failed", status: "error" }),
    ];

    render(<HistoryList tasks={tasks} height={160} />);

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
