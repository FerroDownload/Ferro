import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSettingsStore } from "./useSettingsStore";
import { invokeGetSettings, invokeUpdateSettings } from "@/shared/lib/tauri";

vi.mock("@/shared/lib/tauri", () => ({
  invokeGetSettings: vi.fn(),
  invokeUpdateSettings: vi.fn(),
}));

const createSettings = () => ({
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
  file_collision_behavior: "rename" as const,
  theme_preference: "system" as const,
  seed_ratio_target: 1.0,
  file_allocation_method: "falloc" as const,
  max_tries: 5,
  retry_wait_seconds: 0,
  notifications_enabled: true,
});

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isLoading: false,
      error: null,
      isUpdating: false,
    });
    vi.resetAllMocks();
  });

  it("loads settings", async () => {
    vi.mocked(invokeGetSettings).mockResolvedValueOnce(createSettings());

    await useSettingsStore.getState().loadSettings();

    const state = useSettingsStore.getState();
    expect(state.settings?.download_directory).toBe("C:/Users/Test/Downloads");
    expect(state.error).toBeNull();
  });

  it("captures errors", async () => {
    vi.mocked(invokeGetSettings).mockRejectedValueOnce(new Error("fail"));

    await useSettingsStore.getState().loadSettings();

    const state = useSettingsStore.getState();
    expect(state.error).toBe("fail");
    expect(state.isLoading).toBe(false);
  });

  it("merges and persists settings updates", async () => {
    const currentSettings = createSettings();
    useSettingsStore.setState({ settings: currentSettings });
    vi.mocked(invokeUpdateSettings).mockResolvedValueOnce({
      ...currentSettings,
      close_to_tray: false,
    });

    await useSettingsStore.getState().updateSettings({ close_to_tray: false });

    expect(invokeUpdateSettings).toHaveBeenCalledWith({
      ...currentSettings,
      close_to_tray: false,
    });
    expect(useSettingsStore.getState().settings?.close_to_tray).toBe(false);
    expect(useSettingsStore.getState().isUpdating).toBe(false);
  });
});
