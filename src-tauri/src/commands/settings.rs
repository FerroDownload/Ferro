use tauri::AppHandle;

use crate::services::settings_store::AppSettingsStore;
use crate::state::models::Settings;

pub trait SettingsPersistence {
    fn save(&self, settings: &Settings) -> Result<(), String>;
    fn load(&self) -> Result<Settings, String>;
}

impl SettingsPersistence for AppSettingsStore {
    fn save(&self, settings: &Settings) -> Result<(), String> {
        AppSettingsStore::save(self, settings).map_err(|error| format!("{error:?}"))
    }

    fn load(&self) -> Result<Settings, String> {
        AppSettingsStore::load(self).map_err(|error| format!("{error:?}"))
    }
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let store = AppSettingsStore::new(app);
    store.load().map_err(|error| format!("{error:?}"))
}

#[tauri::command]
pub async fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let store = AppSettingsStore::new(app);
    update_settings_with_store(store, settings).await
}

pub async fn update_settings_with_store(
    store: impl SettingsPersistence,
    settings: Settings,
) -> Result<Settings, String> {
    store.save(&settings)?;
    store.load()
}
