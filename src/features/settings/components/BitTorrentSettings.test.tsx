import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, UnlistenFn } from "@tauri-apps/api/event";

import type { Settings } from "@/shared/lib/types";
import { BitTorrentSettings } from "./BitTorrentSettings";

type TrackerRefreshFailedPayload = {
  reason?: string;
};

const listeners = new Map<
  string,
  (event: Event<TrackerRefreshFailedPayload>) => void
>();
const unlisten = vi.fn<UnlistenFn>(() => undefined);
const updateSettings = vi.fn();
const invokeRefreshTrackers = vi.fn();
let settings: Settings;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (
      eventName: string,
      handler: (event: Event<TrackerRefreshFailedPayload>) => void,
    ) => {
      listeners.set(eventName, handler);
      return unlisten;
    },
  ),
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

vi.mock("@/shared/lib/tauri", () => ({
  invokeRefreshTrackers: () => invokeRefreshTrackers(),
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

describe("BitTorrentSettings", () => {
  beforeEach(() => {
    settings = defaultSettings();
    vi.clearAllMocks();
    listeners.clear();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  });

  it("renders current BitTorrent settings values", () => {
    render(<BitTorrentSettings onToast={vi.fn()} />);

    expect(
      screen.getByRole("checkbox", { name: /auto-update trackers/i }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /dht/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /pex/i })).not.toBeChecked();
    expect(
      screen.getByRole("spinbutton", { name: /seed ratio target/i }),
    ).toHaveValue(1);
  });

  it("updates peer discovery and tracker preferences", async () => {
    const user = userEvent.setup();
    render(<BitTorrentSettings onToast={vi.fn()} />);

    await user.click(
      screen.getByRole("checkbox", { name: /auto-update trackers/i }),
    );
    await user.click(screen.getByRole("checkbox", { name: /dht/i }));
    await user.click(screen.getByRole("checkbox", { name: /pex/i }));

    expect(updateSettings).toHaveBeenCalledWith({
      auto_update_trackers: false,
    });
    expect(updateSettings).toHaveBeenCalledWith({ dht_enabled: true });
    expect(updateSettings).toHaveBeenCalledWith({ pex_enabled: true });
  });

  it("updates seed ratio target on blur", async () => {
    const user = userEvent.setup();
    render(<BitTorrentSettings onToast={vi.fn()} />);

    const seedRatio = screen.getByRole("spinbutton", {
      name: /seed ratio target/i,
    });
    await user.clear(seedRatio);
    await user.type(seedRatio, "2.5");
    await user.tab();

    expect(updateSettings).toHaveBeenCalledWith({ seed_ratio_target: 2.5 });
  });

  it("runs manual tracker refresh and reports the result", async () => {
    invokeRefreshTrackers.mockResolvedValueOnce({
      fetched_at: "2026-05-05T00:00:00Z",
      tracker_count: 42,
    });
    const user = userEvent.setup();

    render(<BitTorrentSettings onToast={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /refresh trackers/i }));

    expect(invokeRefreshTrackers).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Tracker list refreshed: 42 trackers.",
    );
  });

  it("dispatches a toast when manual tracker refresh fails", async () => {
    const onToast = vi.fn();

    render(<BitTorrentSettings onToast={onToast} />);

    await waitFor(() => {
      expect(listeners.has("tracker:refresh_failed")).toBe(true);
    });

    listeners.get("tracker:refresh_failed")?.({
      event: "tracker:refresh_failed",
      id: 1,
      payload: { reason: "network unavailable" },
    });

    expect(onToast).toHaveBeenCalledWith({
      tone: "warning",
      message: "Tracker list refresh failed — using cached list",
    });
  });

  it("removes the tracker refresh listener on unmount", async () => {
    const { unmount } = render(<BitTorrentSettings onToast={vi.fn()} />);

    await waitFor(() => {
      expect(listeners.has("tracker:refresh_failed")).toBe(true);
    });

    unmount();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
