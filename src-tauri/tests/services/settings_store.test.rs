use std::collections::HashMap;

use ferro_lib::services::settings_store::{
    default_file_allocation_method, default_settings, load_settings, save_settings,
};
use ferro_lib::state::models::{
    FileAllocationMethod, FileCollisionBehavior, Settings, ThemePreference,
};
use serde_json::Value as JsonValue;

fn base_settings() -> Settings {
    Settings {
        download_directory: "".to_string(),
        max_concurrent_downloads: 5,
        max_connections_per_task: 16,
        global_download_limit_bps: None,
        global_upload_limit_bps: None,
        auto_update_trackers: true,
        dht_enabled: false,
        pex_enabled: false,
        close_to_tray: true,
        auto_start_on_boot: true,
        auto_start_paused_at_startup: false,
        duplicate_url_warning: true,
        file_collision_behavior: FileCollisionBehavior::Rename,
        theme_preference: ThemePreference::System,
        seed_ratio_target: 1.0,
        file_allocation_method: FileAllocationMethod::Falloc,
        max_tries: 5,
        retry_wait_seconds: 0,
        notifications_enabled: true,
    }
}

#[test]
fn load_settings_applies_store_overrides() {
    let mut store: HashMap<String, JsonValue> = HashMap::new();
    store.insert(
        "download_directory".to_string(),
        JsonValue::String("C:/Users/Test/Downloads".to_string()),
    );
    store.insert(
        "max_concurrent_downloads".to_string(),
        JsonValue::from(10),
    );
    store.insert(
        "theme_preference".to_string(),
        JsonValue::String("dark".to_string()),
    );

    let settings = load_settings(|key| store.get(key).cloned()).expect("load settings");

    assert_eq!(settings.download_directory, "C:/Users/Test/Downloads");
    assert_eq!(settings.max_concurrent_downloads, 10);
    assert_eq!(settings.theme_preference, ThemePreference::Dark);
}

#[test]
fn default_settings_use_platform_adaptive_file_allocation() {
    let expected = if cfg!(target_os = "macos") {
        FileAllocationMethod::None
    } else {
        FileAllocationMethod::Falloc
    };

    assert_eq!(default_file_allocation_method(), expected);
    assert_eq!(default_settings().file_allocation_method, expected);
}

#[test]
fn save_settings_writes_values_and_secret() {
    let mut store: HashMap<String, JsonValue> = HashMap::new();

    let mut settings = base_settings();
    settings.download_directory = "C:/Users/Test/Downloads".to_string();
    settings.max_concurrent_downloads = 8;
    settings.global_upload_limit_bps = Some(500_000);
    settings.theme_preference = ThemePreference::Light;

    save_settings(
        |key, value| {
            store.insert(key.to_string(), value);
            Ok(())
        },
        &settings,
    )
    .expect("save settings");

    assert_eq!(
        store
            .get("download_directory")
            .and_then(JsonValue::as_str),
        Some("C:/Users/Test/Downloads")
    );
    assert_eq!(
        store
            .get("max_concurrent_downloads")
            .and_then(JsonValue::as_u64),
        Some(8)
    );
    assert_eq!(
        store
            .get("global_upload_limit_bps")
            .and_then(JsonValue::as_i64),
        Some(500_000)
    );
    assert_eq!(
        store.get("theme_preference").and_then(JsonValue::as_str),
        Some("light")
    );
}
