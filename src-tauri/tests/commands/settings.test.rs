use std::sync::{Arc, Mutex};

use ferro_lib::commands::settings::{update_settings_with_store, SettingsPersistence};
use ferro_lib::state::models::{
    FileAllocationMethod, FileCollisionBehavior, Settings, ThemePreference,
};

#[derive(Clone, Default)]
struct RecordingSettingsStore {
    saved: Arc<Mutex<Option<Settings>>>,
}

impl SettingsPersistence for RecordingSettingsStore {
    fn save(&self, settings: &Settings) -> Result<(), String> {
        *self.saved.lock().expect("saved settings") = Some(settings.clone());
        Ok(())
    }

    fn load(&self) -> Result<Settings, String> {
        self.saved
            .lock()
            .expect("saved settings")
            .clone()
            .ok_or_else(|| "settings were not saved".to_string())
    }
}

fn settings() -> Settings {
    Settings {
        download_directory: "D:/Downloads".to_string(),
        max_concurrent_downloads: 8,
        max_connections_per_task: 32,
        global_download_limit_bps: Some(250_000),
        global_upload_limit_bps: None,
        auto_update_trackers: false,
        dht_enabled: true,
        pex_enabled: true,
        close_to_tray: false,
        auto_start_on_boot: false,
        auto_start_paused_at_startup: true,
        duplicate_url_warning: false,
        file_collision_behavior: FileCollisionBehavior::Overwrite,
        theme_preference: ThemePreference::Dark,
        seed_ratio_target: 2.5,
        file_allocation_method: FileAllocationMethod::Prealloc,
        max_tries: 9,
        retry_wait_seconds: 30,
        notifications_enabled: false,
    }
}

#[test]
fn update_settings_saves_and_returns_persisted_settings() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let store = RecordingSettingsStore::default();
    let requested = settings();

    let returned = runtime
        .block_on(update_settings_with_store(store.clone(), requested.clone()))
        .expect("update settings");

    assert_eq!(returned, requested);
    assert_eq!(
        store.saved.lock().expect("saved settings").as_ref(),
        Some(&requested)
    );
}
