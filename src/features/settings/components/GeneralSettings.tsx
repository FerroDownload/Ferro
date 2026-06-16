import { disable, enable } from "@tauri-apps/plugin-autostart";

import { useSettingsStore } from "@/features/settings/hooks/useSettingsStore";
import type { ThemePreference } from "@/shared/lib/types";
import {
  settingCheckboxClass,
  settingFieldClass,
  settingHintClass,
  settingInputClass,
  settingLabelClass,
} from "./settingsStyles";

const selectClass = `${settingInputClass} min-w-36`;

type BooleanSettingKey =
  | "close_to_tray"
  | "auto_start_on_boot"
  | "auto_start_paused_at_startup"
  | "notifications_enabled";

type SettingCheckboxProps = {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

const SettingCheckbox = ({
  label,
  description,
  checked,
  disabled,
  onChange,
}: SettingCheckboxProps) => (
  <label className={settingFieldClass}>
    <span className="flex min-w-0 flex-col gap-1">
      <span className={settingLabelClass}>{label}</span>
      <span className={settingHintClass}>{description}</span>
    </span>
    <input
      type="checkbox"
      className={settingCheckboxClass}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  </label>
);

export const GeneralSettings = () => {
  const settings = useSettingsStore((state) => state.settings);
  const isUpdating = useSettingsStore((state) => state.isUpdating);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading general settings...
      </p>
    );
  }

  const updateBoolean = async (
    key: BooleanSettingKey,
    value: boolean,
  ): Promise<void> => {
    if (key === "auto_start_on_boot") {
      if (value) {
        await enable();
      } else {
        await disable();
      }
    }

    await updateSettings({ [key]: value });
  };

  const updateTheme = async (theme: ThemePreference): Promise<void> => {
    await updateSettings({ theme_preference: theme });
  };

  return (
    <div className="flex flex-col gap-3">
      <SettingCheckbox
        label="Close to tray"
        description="Use the window close button to hide Ferro in the system tray."
        checked={settings.close_to_tray}
        disabled={isUpdating}
        onChange={(checked) => {
          void updateBoolean("close_to_tray", checked);
        }}
      />
      <SettingCheckbox
        label="Start Ferro on login"
        description="Register Ferro with the operating system autostart service."
        checked={settings.auto_start_on_boot}
        disabled={isUpdating}
        onChange={(checked) => {
          void updateBoolean("auto_start_on_boot", checked);
        }}
      />
      <SettingCheckbox
        label="OS notifications"
        description="Send completion and error notifications through the operating system."
        checked={settings.notifications_enabled}
        disabled={isUpdating}
        onChange={(checked) => {
          void updateBoolean("notifications_enabled", checked);
        }}
      />
      <SettingCheckbox
        label="Resume paused tasks on startup"
        description="Unpause previously paused tasks during startup recovery."
        checked={settings.auto_start_paused_at_startup}
        disabled={isUpdating}
        onChange={(checked) => {
          void updateBoolean("auto_start_paused_at_startup", checked);
        }}
      />
      <label className={settingFieldClass}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className={settingLabelClass}>Theme</span>
          <span className={settingHintClass}>
            Follow the system theme or force a light or dark interface.
          </span>
        </span>
        <select
          className={selectClass}
          value={settings.theme_preference}
          disabled={isUpdating}
          onChange={(event) => {
            void updateTheme(event.currentTarget.value as ThemePreference);
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
};
