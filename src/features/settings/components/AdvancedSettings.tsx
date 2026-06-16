import { useEffect, useState } from "react";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import { invokeLogOpenFolder } from "@/shared/lib/tauri";
import type { FileAllocationMethod, Settings } from "@/shared/lib/types";
import {
  settingButtonClass,
  settingFieldClass,
  settingHintClass,
  settingInputClass,
  settingLabelClass,
} from "./settingsStyles";

const inputClass = `${settingInputClass} w-32`;
const selectClass = `${settingInputClass} min-w-36`;

type NumericSettingKey =
  | "global_download_limit_bps"
  | "global_upload_limit_bps"
  | "max_tries"
  | "retry_wait_seconds";

const toDraft = (value: number | null) => (value === null ? "" : String(value));

const commitNumericSetting = async (
  key: NumericSettingKey,
  value: string,
  currentValue: number | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
) => {
  if (value.trim() === "") {
    if (currentValue !== null) {
      await updateSettings({ [key]: null });
    }
    return;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed === currentValue) {
    return;
  }

  await updateSettings({ [key]: parsed });
};

export const AdvancedSettings = () => {
  const settings = useSettingsStore((state) => state.settings);
  const isUpdating = useSettingsStore((state) => state.isUpdating);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [downloadLimitDraft, setDownloadLimitDraft] = useState("");
  const [uploadLimitDraft, setUploadLimitDraft] = useState("");
  const [maxTriesDraft, setMaxTriesDraft] = useState("");
  const [retryWaitDraft, setRetryWaitDraft] = useState("");

  useEffect(() => {
    if (!settings) {
      return;
    }

    setDownloadLimitDraft(toDraft(settings.global_download_limit_bps));
    setUploadLimitDraft(toDraft(settings.global_upload_limit_bps));
    setMaxTriesDraft(String(settings.max_tries));
    setRetryWaitDraft(String(settings.retry_wait_seconds));
  }, [settings]);

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading advanced settings...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Global download limit</span>
          <span className={settingHintClass}>
            Bytes per second. Leave empty for no limit.
          </span>
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={downloadLimitDraft}
          disabled={isUpdating}
          onChange={(event) => setDownloadLimitDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "global_download_limit_bps",
              downloadLimitDraft,
              settings.global_download_limit_bps,
              updateSettings,
            );
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Global upload limit</span>
          <span className={settingHintClass}>
            Bytes per second. Leave empty for no limit.
          </span>
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={uploadLimitDraft}
          disabled={isUpdating}
          onChange={(event) => setUploadLimitDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "global_upload_limit_bps",
              uploadLimitDraft,
              settings.global_upload_limit_bps,
              updateSettings,
            );
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>File allocation method</span>
          <span className={settingHintClass}>
            Applied to future downloads and engine startup configuration.
          </span>
        </span>
        <select
          className={selectClass}
          value={settings.file_allocation_method}
          disabled={isUpdating}
          onChange={(event) => {
            void updateSettings({
              file_allocation_method: event.currentTarget
                .value as FileAllocationMethod,
            });
          }}
        >
          <option value="falloc">falloc</option>
          <option value="none">none</option>
          <option value="prealloc">prealloc</option>
          <option value="trunc">trunc</option>
        </select>
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Max tries</span>
          <span className={settingHintClass}>
            Number of aria2 retry attempts for failed transfers.
          </span>
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={maxTriesDraft}
          disabled={isUpdating}
          onChange={(event) => setMaxTriesDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "max_tries",
              maxTriesDraft,
              settings.max_tries,
              updateSettings,
            );
          }}
        />
      </label>

      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Retry wait seconds</span>
          <span className={settingHintClass}>
            Delay between aria2 retry attempts.
          </span>
        </span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className={inputClass}
          value={retryWaitDraft}
          disabled={isUpdating}
          onChange={(event) => setRetryWaitDraft(event.currentTarget.value)}
          onBlur={() => {
            void commitNumericSetting(
              "retry_wait_seconds",
              retryWaitDraft,
              settings.retry_wait_seconds,
              updateSettings,
            );
          }}
        />
      </label>

      <div className={settingFieldClass}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className={settingLabelClass}>Logs</p>
          <p className={settingHintClass}>Open Ferro's OS log directory.</p>
        </div>
        <button
          type="button"
          className={settingButtonClass}
          onClick={() => {
            void invokeLogOpenFolder();
          }}
        >
          Open logs folder
        </button>
      </div>
    </div>
  );
};
