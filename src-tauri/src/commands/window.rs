use tauri::{AppHandle, WebviewWindow};

use crate::services::settings_store::AppSettingsStore;
use crate::state::models::Settings;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowCloseAction {
    HideToTray,
    Exit,
}

pub fn close_action_for_settings(settings: &Settings) -> WindowCloseAction {
    if settings.close_to_tray {
        WindowCloseAction::HideToTray
    } else {
        WindowCloseAction::Exit
    }
}

#[tauri::command]
pub async fn window_close_requested(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let store = AppSettingsStore::new(app.clone());
    let settings = store.load().map_err(|error| format!("{error:?}"))?;

    match close_action_for_settings(&settings) {
        WindowCloseAction::HideToTray => window.hide().map_err(|error| error.to_string())?,
        WindowCloseAction::Exit => app.exit(0),
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::services::settings_store::default_settings;

    use super::{close_action_for_settings, WindowCloseAction};

    #[test]
    fn close_to_tray_setting_hides_window_instead_of_exiting() {
        let mut settings = default_settings();
        settings.close_to_tray = true;

        assert_eq!(
            close_action_for_settings(&settings),
            WindowCloseAction::HideToTray
        );
    }

    #[test]
    fn disabled_close_to_tray_exits_the_app() {
        let mut settings = default_settings();
        settings.close_to_tray = false;

        assert_eq!(
            close_action_for_settings(&settings),
            WindowCloseAction::Exit
        );
    }
}
