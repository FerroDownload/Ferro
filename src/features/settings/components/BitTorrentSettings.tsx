import { useEffect, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { invokeRefreshTrackers } from "@/shared/lib/tauri";
import {
  settingButtonClass,
  settingCheckboxClass,
  settingFieldClass,
  settingHintClass,
  settingInputClass,
  settingLabelClass,
} from "./settingsStyles";

const TRACKER_REFRESH_FAILED_EVENT = "tracker:refresh_failed";
const TRACKER_REFRESH_FAILED_MESSAGE =
  "Tracker list refresh failed — using cached list";

type ToastNotification = {
  tone: "warning";
  message: string;
};

type BitTorrentSettingsProps = {
  onToast: (notification: ToastNotification) => void;
};

const inputClass = `${settingInputClass} w-28`;

export const BitTorrentSettings = ({ onToast }: BitTorrentSettingsProps) => {
  const settings = useSettingsStore((state) => state.settings);
  const isUpdating = useSettingsStore((state) => state.isUpdating);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [seedRatioDraft, setSeedRatioDraft] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;
    let unlisten: UnlistenFn | null = null;

    const register = async () => {
      const cleanup = await listen(TRACKER_REFRESH_FAILED_EVENT, () => {
        onToast({
          tone: "warning",
          message: TRACKER_REFRESH_FAILED_MESSAGE,
        });
      });

      if (isMounted) {
        unlisten = cleanup;
      } else {
        cleanup();
      }
    };

    void register();

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [onToast]);

  useEffect(() => {
    if (settings) {
      setSeedRatioDraft(String(settings.seed_ratio_target));
    }
  }, [settings]);

  if (!settings) {
    return (
      <section
        aria-labelledby="bittorrent-settings-title"
        className="flex flex-col gap-4"
      >
        <div>
          <h2 id="bittorrent-settings-title" className="text-lg font-semibold">
            BitTorrent
          </h2>
          <p className="text-sm text-muted-foreground">
            Loading BitTorrent settings...
          </p>
        </div>
      </section>
    );
  }

  const updateSeedRatio = async () => {
    const parsed = Number(seedRatioDraft);
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      parsed === settings.seed_ratio_target
    ) {
      return;
    }

    await updateSettings({ seed_ratio_target: parsed });
  };

  const refreshTrackers = async () => {
    setRefreshing(true);
    setRefreshStatus(null);
    try {
      const result = await invokeRefreshTrackers();
      setRefreshStatus(
        `Tracker list refreshed: ${result.tracker_count} trackers.`,
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section
      aria-labelledby="bittorrent-settings-title"
      className="border-b border-border/80 pb-6"
    >
      <div className="grid gap-3 lg:grid-cols-[160px_1fr]">
        <div>
          <h2 id="bittorrent-settings-title" className="text-lg font-semibold">
            BitTorrent
          </h2>
        </div>
        <div className="flex flex-col gap-3">
          <label className={settingFieldClass}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={settingLabelClass}>Auto-update trackers</span>
              <span className={settingHintClass}>
                Refresh the supplemental tracker cache on app start.
              </span>
            </span>
            <input
              type="checkbox"
              className={settingCheckboxClass}
              checked={settings.auto_update_trackers}
              disabled={isUpdating}
              onChange={(event) => {
                void updateSettings({
                  auto_update_trackers: event.currentTarget.checked,
                });
              }}
            />
          </label>

          <label className={settingFieldClass}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={settingLabelClass}>DHT</span>
              <span className={settingHintClass}>
                Enable distributed hash table peer discovery for torrents.
              </span>
            </span>
            <input
              type="checkbox"
              className={settingCheckboxClass}
              checked={settings.dht_enabled}
              disabled={isUpdating}
              onChange={(event) => {
                void updateSettings({
                  dht_enabled: event.currentTarget.checked,
                });
              }}
            />
          </label>

          <label className={settingFieldClass}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={settingLabelClass}>PEX</span>
              <span className={settingHintClass}>
                Enable peer exchange for active BitTorrent downloads.
              </span>
            </span>
            <input
              type="checkbox"
              className={settingCheckboxClass}
              checked={settings.pex_enabled}
              disabled={isUpdating}
              onChange={(event) => {
                void updateSettings({
                  pex_enabled: event.currentTarget.checked,
                });
              }}
            />
          </label>

          <label className={settingFieldClass}>
            <span className="flex min-w-0 flex-col gap-1">
              <span className={settingLabelClass}>Seed ratio target</span>
              <span className={settingHintClass}>
                Stop seeding after the configured upload-to-download ratio.
              </span>
            </span>
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputClass}
              value={seedRatioDraft}
              disabled={isUpdating}
              onChange={(event) => setSeedRatioDraft(event.currentTarget.value)}
              onBlur={() => {
                void updateSeedRatio();
              }}
            />
          </label>

          <div className={settingFieldClass}>
            <div className="flex min-w-0 flex-col gap-1">
              <p className={settingLabelClass}>Tracker cache</p>
              <p className={settingHintClass}>
                Manually refresh from the fixed ngosang tracker list source.
              </p>
              {refreshStatus ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {refreshStatus}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className={settingButtonClass}
              disabled={isRefreshing}
              onClick={() => {
                void refreshTrackers();
              }}
            >
              {isRefreshing ? "Refreshing..." : "Refresh trackers"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
