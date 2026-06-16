import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@/shared/lib/types";
import { DownloadSettings } from "./DownloadSettings";

const updateSettings = vi.fn();
let settings: Settings;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@/features/settings/hooks/useSettingsStore", () => ({
  useSettingsStore: (
    selector: (state: {
      settings: Settings | null;
      updateSettings: (patch: Partial<Settings>) => Promise<void>;
      isUpdating: boolean;
    }) => unknown,
  ) => selector({ settings, updateSettings, isUpdating: false }),
}));

const defaultSettings = (): Settings => ({
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
  seed_ratio_target: 1,
  file_allocation_method: "falloc",
  max_tries: 5,
  retry_wait_seconds: 0,
  notifications_enabled: true,
});

describe("DownloadSettings", () => {
  beforeEach(() => {
    settings = defaultSettings();
    vi.clearAllMocks();
  });

  it("renders current download settings values", () => {
    render(<DownloadSettings />);

    expect(
      screen.getByRole("textbox", { name: /download directory/i }),
    ).toHaveValue("C:/Users/Test/Downloads");
    expect(
      screen.getByRole("spinbutton", { name: /maximum active downloads/i }),
    ).toHaveValue(5);
    expect(
      screen.getByRole("spinbutton", { name: /connections per task/i }),
    ).toHaveValue(16);
    expect(
      screen.getByRole("checkbox", { name: /duplicate url warnings/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: /file collision behavior/i }),
    ).toHaveValue("rename");
  });

  it("chooses a download directory with the native dialog", async () => {
    vi.mocked(open).mockResolvedValueOnce("D:/Downloads");
    const user = userEvent.setup();

    render(<DownloadSettings />);

    await user.click(screen.getByRole("button", { name: /choose folder/i }));

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Select download directory",
    });
    expect(updateSettings).toHaveBeenCalledWith({
      download_directory: "D:/Downloads",
    });
  });

  it("updates numeric download limits on blur", async () => {
    const user = userEvent.setup();
    render(<DownloadSettings />);

    const activeDownloads = screen.getByRole("spinbutton", {
      name: /maximum active downloads/i,
    });
    await user.clear(activeDownloads);
    await user.type(activeDownloads, "8");
    await user.tab();

    const connections = screen.getByRole("spinbutton", {
      name: /connections per task/i,
    });
    await user.clear(connections);
    await user.type(connections, "32");
    await user.tab();

    expect(updateSettings).toHaveBeenCalledWith({
      max_concurrent_downloads: 8,
    });
    expect(updateSettings).toHaveBeenCalledWith({
      max_connections_per_task: 32,
    });
  });

  it("updates duplicate warning and collision preferences", async () => {
    const user = userEvent.setup();
    render(<DownloadSettings />);

    await user.click(
      screen.getByRole("checkbox", { name: /duplicate url warnings/i }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /file collision behavior/i }),
      ["overwrite"],
    );

    expect(updateSettings).toHaveBeenCalledWith({
      duplicate_url_warning: false,
    });
    expect(updateSettings).toHaveBeenCalledWith({
      file_collision_behavior: "overwrite",
    });
  });
});
