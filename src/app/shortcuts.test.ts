import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  pauseAllTasks,
  resumeAllTasks,
} from "@/features/tasks/services/taskCommands";
import type { Task } from "@/shared/lib/types";
import { createShortcutHandler, registerShortcuts } from "./shortcuts";
import { createAppRouter } from "./routes";

const { useTasksMock } = vi.hoisted(() => ({
  useTasksMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@/features/settings/hooks/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (state: {
      settings: {
        download_directory: string;
        max_concurrent_downloads: number;
        max_connections_per_task: number;
        global_download_limit_bps: number | null;
        global_upload_limit_bps: number | null;
        auto_update_trackers: boolean;
        dht_enabled: boolean;
        pex_enabled: boolean;
        close_to_tray: boolean;
        auto_start_on_boot: boolean;
        auto_start_paused_at_startup: boolean;
        duplicate_url_warning: boolean;
        file_collision_behavior: "rename";
        theme_preference: "system";
        seed_ratio_target: number;
        file_allocation_method: "falloc";
        max_tries: number;
        retry_wait_seconds: number;
        notifications_enabled: boolean;
      };
      isLoading: boolean;
      error: string | null;
      loadSettings: () => Promise<void>;
    }) => unknown,
  ) =>
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
      error: null,
      loadSettings: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock("@/features/tasks/hooks/useTasks", () => ({
  useTasks: () => useTasksMock(),
}));

vi.mock("@/features/tasks/services/taskCommands", () => ({
  addTask: vi.fn().mockResolvedValue(undefined),
  addTorrentTask: vi.fn().mockResolvedValue(undefined),
  pauseTask: vi.fn().mockResolvedValue(undefined),
  resumeTask: vi.fn().mockResolvedValue(undefined),
  pauseAllTasks: vi.fn().mockResolvedValue(undefined),
  resumeAllTasks: vi.fn().mockResolvedValue(undefined),
  triggerRestartRecovery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/features/tasks/services/torrentCommands", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/tasks/services/torrentCommands")
  >("@/features/tasks/services/torrentCommands");

  return {
    ...actual,
    fetchTorrentMetadata: vi.fn(),
  };
});

const renderDownloadsRoute = () => {
  render(createElement(RouterProvider, { router: createAppRouter(["/"]) }));
};

const setClipboardText = (text: string) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      readText: vi.fn().mockResolvedValue(text),
    },
  });
};

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

describe("shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    setClipboardText("");
  });

  it("handles primary modifier shortcuts", () => {
    const handlers = {
      onNewDownload: vi.fn(),
      onPasteUrl: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onFocusSearch: vi.fn(),
    };
    const handler = createShortcutHandler(handlers);

    handler(new KeyboardEvent("keydown", { key: "n", ctrlKey: true }));
    handler(new KeyboardEvent("keydown", { key: "v", metaKey: true }));
    handler(new KeyboardEvent("keydown", { key: "p", ctrlKey: true }));
    handler(new KeyboardEvent("keydown", { key: "r", metaKey: true }));
    handler(new KeyboardEvent("keydown", { key: "f", ctrlKey: true }));

    expect(handlers.onNewDownload).toHaveBeenCalledTimes(1);
    expect(handlers.onPasteUrl).toHaveBeenCalledTimes(1);
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
  });

  it("handles delete shortcut", () => {
    const handlers = { onRemove: vi.fn() };
    const handler = createShortcutHandler(handlers);

    handler(new KeyboardEvent("keydown", { key: "Delete" }));

    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
  });

  it("registers and unregisters keydown handler", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const unsubscribe = registerShortcuts({});

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    unsubscribe();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("opens the add download dialog from the routed app shell with Ctrl+N", async () => {
    renderDownloadsRoute();

    await userEvent.keyboard("{Control>}n{/Control}");

    expect(
      await screen.findByRole("heading", { name: /add download/i }),
    ).toBeInTheDocument();
  });

  it("prefills a valid clipboard URL with Ctrl+V when the main window is focused", async () => {
    setClipboardText(" https://example.com/archive.zip ");
    renderDownloadsRoute();

    await userEvent.keyboard("{Control>}v{/Control}");

    expect(
      await screen.findByRole("heading", { name: /add download/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/download url/i)).toHaveValue(
      "https://example.com/archive.zip",
    );
  });

  it("does not hijack Ctrl+V from editable controls", async () => {
    const user = userEvent.setup();
    renderDownloadsRoute();

    await user.click(screen.getByLabelText(/search/i));
    await user.keyboard("{Control>}v{/Control}");

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /add download/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("focuses the current task search input from the routed app shell with Ctrl+F", async () => {
    renderDownloadsRoute();

    await userEvent.keyboard("{Control>}f{/Control}");

    expect(
      screen.getByRole("searchbox", { name: /search downloads/i }),
    ).toHaveFocus();
  });

  it("pauses and resumes the queue from the routed app shell", async () => {
    const reload = vi.fn();
    useTasksMock.mockReturnValue({
      tasks: [],
      activeTasks: [
        createTask({ id: "active-task", status: "active" }),
        createTask({ id: "paused-task", status: "paused" }),
      ],
      historyTasks: [],
      allTasks: [],
      isLoading: false,
      error: null,
      reload,
    });
    renderDownloadsRoute();

    await userEvent.keyboard("{Control>}p{/Control}");
    await waitFor(() => {
      expect(pauseAllTasks).toHaveBeenCalledTimes(1);
    });

    await userEvent.keyboard("{Control>}r{/Control}");
    await waitFor(() => {
      expect(resumeAllTasks).toHaveBeenCalledTimes(1);
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
