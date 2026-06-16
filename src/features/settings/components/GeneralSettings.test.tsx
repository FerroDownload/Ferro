import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@/shared/lib/types";
import { GeneralSettings } from "./GeneralSettings";

const enableAutostart = vi.fn();
const disableAutostart = vi.fn();
const updateSettings = vi.fn();

let settings: Settings;

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: () => enableAutostart(),
  disable: () => disableAutostart(),
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

describe("GeneralSettings", () => {
  beforeEach(() => {
    settings = defaultSettings();
    vi.clearAllMocks();
  });

  it("renders current general settings values", () => {
    render(<GeneralSettings />);

    expect(
      screen.getByRole("checkbox", { name: /close to tray/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /start ferro on login/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /os notifications/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /resume paused tasks on startup/i }),
    ).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: /theme/i })).toHaveValue(
      "system",
    );
  });

  it("updates immediate app preferences through the settings store", async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);

    await user.click(screen.getByRole("checkbox", { name: /close to tray/i }));
    await user.click(
      screen.getByRole("checkbox", { name: /os notifications/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /resume paused tasks on startup/i }),
    );
    await user.selectOptions(screen.getByRole("combobox", { name: /theme/i }), [
      "dark",
    ]);

    expect(updateSettings).toHaveBeenCalledWith({ close_to_tray: false });
    expect(updateSettings).toHaveBeenCalledWith({
      notifications_enabled: false,
    });
    expect(updateSettings).toHaveBeenCalledWith({
      auto_start_paused_at_startup: true,
    });
    expect(updateSettings).toHaveBeenCalledWith({ theme_preference: "dark" });
  });

  it("enables OS autostart before persisting the preference", async () => {
    settings = { ...defaultSettings(), auto_start_on_boot: false };
    const user = userEvent.setup();
    render(<GeneralSettings />);

    await user.click(
      screen.getByRole("checkbox", { name: /start ferro on login/i }),
    );

    expect(enableAutostart).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ auto_start_on_boot: true });
  });

  it("disables OS autostart before persisting the preference", async () => {
    const user = userEvent.setup();
    render(<GeneralSettings />);

    await user.click(
      screen.getByRole("checkbox", { name: /start ferro on login/i }),
    );

    expect(disableAutostart).toHaveBeenCalledTimes(1);
    expect(updateSettings).toHaveBeenCalledWith({ auto_start_on_boot: false });
  });
});
