import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import type { FileCollisionBehavior, Settings } from "@/shared/lib/types";
import {
  settingButtonClass,
  settingCheckboxClass,
  settingFieldClass,
  settingHintClass,
  settingInputClass,
  settingLabelClass,
} from "./settingsStyles";

const inputClass = `${settingInputClass} w-full`;
const compactInputClass = `${settingInputClass} w-28`;
const selectClass = `${settingInputClass} min-w-40`;

type NumericSettingKey =
  | "max_concurrent_downloads"
  | "max_connections_per_task";

const commitNumericSetting = async (
  key: NumericSettingKey,
  value: string,
  currentValue: number,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed === currentValue) {
    return;
  }

  await updateSettings({ [key]: parsed });
};

export const DownloadSettings = () => {
  const settings = useSettingsStore((state) => state.settings);
  const isUpdating = useSettingsStore((state) => state.isUpdating);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [maxActiveDraft, setMaxActiveDraft] = useState("");
  const [connectionsDraft, setConnectionsDraft] = useState("");

  useEffect(() => {
    if (!settings) {
      return;
    }

    setMaxActiveDraft(String(settings.max_concurrent_downloads));
    setConnectionsDraft(String(settings.max_connections_per_task));
  }, [settings]);

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading download settings...
      </p>
    );
  }

  const chooseDownloadDirectory = async () => {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Select download directory",
    });

    if (typeof selection === "string") {
      await updateSettings({ download_directory: selection });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={settingFieldClass}>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={settingLabelClass}>Download directory</span>
          <span className={settingHintClass}>
            Default folder used for new downloads.
          </span>
          <input
            className={inputClass}
            value={settings.download_directory}
            readOnly
            aria-label="Download directory"
          />
        </label>
        <button
          type="button"
          className={`sm:mt-6 ${settingButtonClass}`}
          disabled={isUpdating}
          onClick={() => {
            void chooseDownloadDirectory();
          }}
        >
          Choose folder
        </button>
      </div>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Maximum active downloads</span>
          <span className={settingHintClass}>
            Maps to aria2 max-concurrent-downloads.
          </span>
        </span>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          className={compactInputClass}
          value={maxActiveDraft}
          disabled={isUpdating}
          onChange={(event) => setMaxActiveDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "max_concurrent_downloads",
              maxActiveDraft,
              settings.max_concurrent_downloads,
              updateSettings,
            );
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Connections per task</span>
          <span className={settingHintClass}>
            Sets aria2 split and max-connection-per-server together.
          </span>
        </span>
        <input
          type="number"
          min={1}
          max={64}
          inputMode="numeric"
          className={compactInputClass}
          value={connectionsDraft}
          disabled={isUpdating}
          onChange={(event) => setConnectionsDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "max_connections_per_task",
              connectionsDraft,
              settings.max_connections_per_task,
              updateSettings,
            );
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Duplicate URL warnings</span>
          <span className={settingHintClass}>
            Warn before creating a duplicate active download.
          </span>
        </span>
        <input
          type="checkbox"
          className={settingCheckboxClass}
          checked={settings.duplicate_url_warning}
          disabled={isUpdating}
          onChange={(event) => {
            void updateSettings({
              duplicate_url_warning: event.currentTarget.checked,
            });
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>File collision behavior</span>
          <span className={settingHintClass}>
            Decide what Ferro does when the target file already exists.
          </span>
        </span>
        <select
          className={selectClass}
          value={settings.file_collision_behavior}
          disabled={isUpdating}
          onChange={(event) => {
            void updateSettings({
              file_collision_behavior: event.currentTarget
                .value as FileCollisionBehavior,
            });
          }}
        >
          <option value="rename">Rename</option>
          <option value="overwrite">Overwrite</option>
          <option value="skip">Skip</option>
        </select>
      </label>
    </div>
  );
};
