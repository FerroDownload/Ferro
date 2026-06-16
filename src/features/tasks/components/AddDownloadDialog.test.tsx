import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import { AddDownloadDialog } from "./AddDownloadDialog";
import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import type { Task } from "@/shared/lib/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const defaultDownloadsDir = "C:/Users/Test/Downloads";

const createTask = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  aria2_gid: null,
  source_uri: "https://example.com/file.zip",
  display_name: "Example File",
  destination_path: `${defaultDownloadsDir}/file.zip`,
  status: "active",
  progress_percent: 10,
  downloaded_bytes: 100,
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

// Ref: https://testing-library.com/docs/user-event/intro
// Ref: https://github.com/testing-library/react-testing-library/blob/main/README.md

describe("AddDownloadDialog", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isLoading: false,
      error: null,
      loadSettings: vi.fn(),
    });
    vi.resetAllMocks();
  });

  it("renders default fields and validation errors", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <AddDownloadDialog
        isOpen
        tasks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add download/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /enter a url to download/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefills destination from settings and submits", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    useSettingsStore.setState({
      settings: {
        download_directory: defaultDownloadsDir,
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
      loadSettings: vi.fn(),
    });

    render(
      <AddDownloadDialog
        isOpen
        tasks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByLabelText(/download url/i),
      "https://example.com/file.zip",
    );
    await user.click(screen.getByRole("button", { name: /add download/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "url",
      url: "https://example.com/file.zip",
      destination: defaultDownloadsDir,
    });
  });

  it("allows selecting a download directory", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValueOnce(defaultDownloadsDir);

    render(
      <AddDownloadDialog
        isOpen
        tasks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^browse$/i }));

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
    await waitFor(() =>
      expect(screen.getByLabelText(/save to/i)).toHaveValue(
        defaultDownloadsDir,
      ),
    );
  });

  it("allows selecting a torrent file from the add dialog", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    vi.mocked(open).mockResolvedValueOnce(
      "C:/Users/Test/Downloads/example.torrent",
    );

    render(
      <AddDownloadDialog
        isOpen
        tasks={[]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /browse torrent file/i }),
    );

    expect(open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [{ name: "Torrent files", extensions: ["torrent"] }],
    });
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "torrent",
      torrentPath: "C:/Users/Test/Downloads/example.torrent",
      destination: "",
    });
  });

  it("shows duplicate warning when enabled", () => {
    useSettingsStore.setState({
      settings: {
        download_directory: defaultDownloadsDir,
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
      loadSettings: vi.fn(),
    });

    render(
      <AddDownloadDialog
        isOpen
        tasks={[createTask({})]}
        initialUrl="https://example.com/file.zip"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /already in your active downloads/i,
    );
  });

  it("loads settings when opening and none are present", async () => {
    const loadSettings = vi.fn();
    useSettingsStore.setState({
      settings: null,
      isLoading: false,
      error: null,
      loadSettings,
    });

    render(
      <AddDownloadDialog
        isOpen
        tasks={[]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await waitFor(() => expect(loadSettings).toHaveBeenCalled());
  });

  it("moves initial focus into the URL input, traps tab focus, closes on Esc, and restores trigger focus", async () => {
    const user = userEvent.setup();

    const Harness = () => {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open add dialog
          </button>
          <AddDownloadDialog
            isOpen={open}
            tasks={[]}
            onClose={() => setOpen(false)}
            onSubmit={vi.fn()}
          />
        </>
      );
    };

    render(<Harness />);

    const trigger = screen.getByRole("button", { name: /open add dialog/i });
    await user.click(trigger);

    expect(screen.getByLabelText(/download url/i)).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: /add download/i })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
