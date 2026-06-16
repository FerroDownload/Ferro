import { render } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { TaskList } from "@/features/tasks/components/TaskList";
import type { Task } from "@/shared/lib/types";

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

describe("accessibility smoke checks", () => {
  it("has no critical or serious axe violations in the task list shell", async () => {
    const { container } = render(
      <MemoryRouter>
        <TaskList tasks={[createTask({})]} />
      </MemoryRouter>,
    );

    const results = await axe.run(container, {
      resultTypes: ["violations"],
      rules: {
        "color-contrast": { enabled: false },
      },
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    const blockingViolations = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );

    expect(blockingViolations).toEqual([]);
  });
});
