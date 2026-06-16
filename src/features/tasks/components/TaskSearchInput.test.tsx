import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/shared/lib/types";
import {
  filterTasksBySearchQuery,
  NoTaskSearchMatches,
  TaskSearchInput,
} from "./TaskSearchInput";

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: "C:/Users/Test/Downloads/file.zip",
  status: "active",
  progress_percent: 0,
  downloaded_bytes: 0,
  total_bytes: 1024,
  download_speed_bps: 0,
  upload_speed_bps: 0,
  created_at: "2026-02-04T00:00:00Z",
  updated_at: "2026-02-04T00:00:00Z",
  completed_at: null,
  uploaded_bytes: 0,
  orphan_imported: false,
  error_message: null,
  is_torrent: false,
  torrent_info_hash: null,
  selected_files: null,
  ...overrides,
});

describe("TaskSearchInput", () => {
  it("renders an accessible controlled search field", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    const Harness = () => {
      const [query, setQuery] = useState("");
      return (
        <TaskSearchInput
          query={query}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            onQueryChange(nextQuery);
          }}
        />
      );
    };

    render(<Harness />);

    const input = screen.getByRole("searchbox", {
      name: /search downloads/i,
    });
    await user.type(input, "report");

    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveValue("report");
    expect(onQueryChange).toHaveBeenLastCalledWith("report");
  });

  it("filters tasks by filename or source URI with case-insensitive substrings", () => {
    const tasks = [
      createTask({
        id: "task-1",
        display_name: "Quarterly Report.pdf",
        source_uri: "https://cdn.example.com/files/report.pdf",
      }),
      createTask({
        id: "task-2",
        display_name: "Installer.exe",
        source_uri: "https://downloads.example.com/Ferro/installer.exe",
      }),
      createTask({
        id: "task-3",
        display_name: "Video.mp4",
        source_uri: "https://media.example.com/video.mp4",
      }),
    ];

    expect(
      filterTasksBySearchQuery(tasks, "report").map((task) => task.id),
    ).toEqual(["task-1"]);
    expect(
      filterTasksBySearchQuery(tasks, "FERRO").map((task) => task.id),
    ).toEqual(["task-2"]);
    expect(
      filterTasksBySearchQuery(tasks, "   ").map((task) => task.id),
    ).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("renders the no-match state with the current query", () => {
    render(<NoTaskSearchMatches query="missing.iso" />);

    expect(
      screen.getByText(/no tasks match "missing\.iso"/i),
    ).toBeInTheDocument();
  });
});
