import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@/shared/lib/types";
import { AdvancedSettings } from "./AdvancedSettings";

const updateSettings = vi.fn();
const invokeLogOpenFolder = vi.fn();
let settings: Settings;

vi.mock("@/shared/lib/tauri", () => ({
  invokeLogOpenFolder: () => invokeLogOpenFolder(),
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
  global_upload_limit_bps: 100000,
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

describe("AdvancedSettings", () => {
  beforeEach(() => {
    settings = defaultSettings();
    vi.clearAllMocks();
  });

  it("renders current advanced settings values", () => {
    render(<AdvancedSettings />);

    expect(
      screen.getByRole("spinbutton", { name: /global download limit/i }),
    ).toHaveValue(null);
    expect(
      screen.getByRole("spinbutton", { name: /global upload limit/i }),
    ).toHaveValue(100000);
    expect(
      screen.getByRole("combobox", { name: /file allocation method/i }),
    ).toHaveValue("falloc");
    expect(screen.getByRole("spinbutton", { name: /max tries/i })).toHaveValue(
      5,
    );
    expect(
      screen.getByRole("spinbutton", { name: /retry wait seconds/i }),
    ).toHaveValue(0);
  });

  it("updates global speed limits on blur", async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    const downloadLimit = screen.getByRole("spinbutton", {
      name: /global download limit/i,
    });
    await user.type(downloadLimit, "250000");
    await user.tab();

    const uploadLimit = screen.getByRole("spinbutton", {
      name: /global upload limit/i,
    });
    await user.clear(uploadLimit);
    await user.tab();

    expect(updateSettings).toHaveBeenCalledWith({
      global_download_limit_bps: 250000,
    });
    expect(updateSettings).toHaveBeenCalledWith({
      global_upload_limit_bps: null,
    });
  });

  it("updates retry and allocation preferences", async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /file allocation method/i }),
      ["prealloc"],
    );

    const maxTries = screen.getByRole("spinbutton", { name: /max tries/i });
    await user.clear(maxTries);
    await user.type(maxTries, "9");
    await user.tab();

    const retryWait = screen.getByRole("spinbutton", {
      name: /retry wait seconds/i,
    });
    await user.clear(retryWait);
    await user.type(retryWait, "30");
    await user.tab();

    expect(updateSettings).toHaveBeenCalledWith({
      file_allocation_method: "prealloc",
    });
    expect(updateSettings).toHaveBeenCalledWith({ max_tries: 9 });
    expect(updateSettings).toHaveBeenCalledWith({ retry_wait_seconds: 30 });
  });

  it("opens the logs folder", async () => {
    const user = userEvent.setup();
    render(<AdvancedSettings />);

    await user.click(screen.getByRole("button", { name: /open logs folder/i }));

    expect(invokeLogOpenFolder).toHaveBeenCalledTimes(1);
  });
});
