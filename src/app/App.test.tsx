import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { triggerRestartRecovery } from "@/features/tasks/services/taskCommands";
import AppShell from "./App";

vi.mock("@/features/settings/hooks/useSettingsStore", () => ({
  useSettingsStore: vi.fn(),
}));
vi.mock("@/features/tasks/services/taskCommands", () => ({
  triggerRestartRecovery: vi.fn(),
}));

// Ref: https://github.com/testing-library/react-testing-library/blob/main/README.md
const renderShell = () => {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <AppShell />,
      children: [{ index: true, element: <div>Shell Outlet</div> }],
    },
  ]);

  return render(<RouterProvider router={router} />);
};

describe("AppShell", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useSettingsStore).mockImplementation((selector) =>
      selector({
        settings: null,
        isLoading: false,
        isUpdating: false,
        error: null,
        loadSettings: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
      }),
    );
  });

  it("renders the sidebar and outlet", () => {
    const { container } = renderShell();

    expect(
      screen.getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: /transfer workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/shell outlet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /downloads/i }),
    ).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).queryByText("Ferro")).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByText(/download manager/i),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".bg-\\[\\#ff6b4a\\]")).toBeNull();
    expect(container.querySelector(".bg-\\[\\#f7b84b\\]")).toBeNull();
    expect(container.querySelector(".bg-\\[\\#65c466\\]")).toBeNull();
  });

  it("triggers restart recovery when auto-resume is enabled", () => {
    vi.mocked(useSettingsStore).mockImplementation((selector) =>
      selector({
        settings: {
          download_directory: "C:/Users/Test/Downloads",
          max_concurrent_downloads: 5,
          max_connections_per_task: 16,
          global_download_limit_bps: null,
          global_upload_limit_bps: null,
          auto_update_trackers: true,
          dht_enabled: false,
          pex_enabled: false,
          close_to_tray: true,
          auto_start_on_boot: true,
          auto_start_paused_at_startup: false,
          duplicate_url_warning: true,
          file_collision_behavior: "rename",
          theme_preference: "system",
          seed_ratio_target: 1.0,
          file_allocation_method: "falloc",
          max_tries: 5,
          retry_wait_seconds: 0,
          notifications_enabled: true,
        },
        isLoading: false,
        isUpdating: false,
        error: null,
        loadSettings: vi.fn().mockResolvedValue(undefined),
        updateSettings: vi.fn().mockResolvedValue(undefined),
      }),
    );

    renderShell();

    expect(triggerRestartRecovery).toHaveBeenCalled();
  });
});
