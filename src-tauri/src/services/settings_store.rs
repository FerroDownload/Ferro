use serde_json::{json, Value as JsonValue};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime, Wry};
use tauri_plugin_store::StoreExt;

use crate::state::models::{
    FileAllocationMethod, FileCollisionBehavior, Settings, ThemePreference,
};

const STORE_PATH: &str = "settings.json";

#[derive(Debug)]
pub enum SettingsError {
    Store(String),
    Keyring(String),
    Serde(String),
}

impl From<tauri_plugin_store::Error> for SettingsError {
    fn from(value: tauri_plugin_store::Error) -> Self {
        Self::Store(value.to_string())
    }
}

impl From<serde_json::Error> for SettingsError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value.to_string())
    }
}

pub struct AppSettingsStore<R: Runtime = Wry> {
    app: AppHandle<R>,
}

impl<R: Runtime> AppSettingsStore<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    pub fn load(&self) -> Result<Settings, SettingsError> {
        let store = self.app.store(STORE_PATH)?;
        let mut settings = load_settings(|key| store.get(key))?;
        if settings.download_directory.trim().is_empty() {
            if let Ok(path) = self.app.path().resolve("", BaseDirectory::Download) {
                settings.download_directory = path.to_string_lossy().to_string();
            }
        }
        store.close_resource();
        Ok(settings)
    }

    pub fn save(&self, settings: &Settings) -> Result<(), SettingsError> {
        let store = self.app.store(STORE_PATH)?;
        save_settings(
            |key, value| {
                store.set(key, value);
                Ok(())
            },
            settings,
        )?;
        store.close_resource();
        Ok(())
    }
}

pub fn load_settings<Get>(mut get: Get) -> Result<Settings, SettingsError>
where
    Get: FnMut(&str) -> Option<JsonValue>,
{
    let mut settings = default_settings();

    if let Some(value) = get("download_directory") {
        settings.download_directory = value.as_str().unwrap_or_default().to_string();
    }
    if let Some(value) = get("max_concurrent_downloads") {
        settings.max_concurrent_downloads = value.as_u64().unwrap_or(5) as u32;
    }
    if let Some(value) = get("max_connections_per_task") {
        settings.max_connections_per_task = value.as_u64().unwrap_or(16) as u32;
    }
    if let Some(value) = get("global_download_limit_bps") {
        settings.global_download_limit_bps = value.as_i64();
    }
    if let Some(value) = get("global_upload_limit_bps") {
        settings.global_upload_limit_bps = value.as_i64();
    }
    if let Some(value) = get("auto_update_trackers") {
        settings.auto_update_trackers = value.as_bool().unwrap_or(true);
    }
    if let Some(value) = get("dht_enabled") {
        settings.dht_enabled = value.as_bool().unwrap_or(false);
    }
    if let Some(value) = get("pex_enabled") {
        settings.pex_enabled = value.as_bool().unwrap_or(false);
    }
    if let Some(value) = get("close_to_tray") {
        settings.close_to_tray = value.as_bool().unwrap_or(true);
    }
    if let Some(value) = get("auto_start_on_boot") {
        settings.auto_start_on_boot = value.as_bool().unwrap_or(true);
    }
    if let Some(value) = get("auto_start_paused_at_startup") {
        settings.auto_start_paused_at_startup = value.as_bool().unwrap_or(false);
    }
    if let Some(value) = get("duplicate_url_warning") {
        settings.duplicate_url_warning = value.as_bool().unwrap_or(true);
    }
    if let Some(value) = get("file_collision_behavior") {
        settings.file_collision_behavior = match value.as_str().unwrap_or("rename") {
            "overwrite" => FileCollisionBehavior::Overwrite,
            "skip" => FileCollisionBehavior::Skip,
            _ => FileCollisionBehavior::Rename,
        };
    }
    if let Some(value) = get("theme_preference") {
        settings.theme_preference = match value.as_str().unwrap_or("system") {
            "light" => ThemePreference::Light,
            "dark" => ThemePreference::Dark,
            _ => ThemePreference::System,
        };
    }

    if let Some(value) = get("seed_ratio_target") {
        settings.seed_ratio_target = value.as_f64().unwrap_or(1.0);
    }
    if let Some(value) = get("file_allocation_method") {
        settings.file_allocation_method = match value.as_str().unwrap_or("falloc") {
            "none" => FileAllocationMethod::None,
            "prealloc" => FileAllocationMethod::Prealloc,
            "trunc" => FileAllocationMethod::Trunc,
            _ => FileAllocationMethod::Falloc,
        };
    }
    if let Some(value) = get("max_tries") {
        settings.max_tries = value.as_u64().unwrap_or(5) as u32;
    }
    if let Some(value) = get("retry_wait_seconds") {
        settings.retry_wait_seconds = value.as_u64().unwrap_or(0) as u32;
    }
    if let Some(value) = get("notifications_enabled") {
        settings.notifications_enabled = value.as_bool().unwrap_or(true);
    }

    Ok(settings)
}

pub fn save_settings<Set>(mut set: Set, settings: &Settings) -> Result<(), SettingsError>
where
    Set: FnMut(&str, JsonValue) -> Result<(), SettingsError>,
{
    // Ref: https://v2.tauri.app/plugin/store
    set("download_directory", json!(settings.download_directory))?;
    set(
        "max_concurrent_downloads",
        json!(settings.max_concurrent_downloads),
    )?;
    set(
        "max_connections_per_task",
        json!(settings.max_connections_per_task),
    )?;
    set(
        "global_download_limit_bps",
        settings
            .global_download_limit_bps
            .map(JsonValue::from)
            .unwrap_or(JsonValue::Null),
    )?;
    set(
        "global_upload_limit_bps",
        settings
            .global_upload_limit_bps
            .map(JsonValue::from)
            .unwrap_or(JsonValue::Null),
    )?;
    set("auto_update_trackers", json!(settings.auto_update_trackers))?;
    set("dht_enabled", json!(settings.dht_enabled))?;
    set("pex_enabled", json!(settings.pex_enabled))?;
    set("close_to_tray", json!(settings.close_to_tray))?;
    set("auto_start_on_boot", json!(settings.auto_start_on_boot))?;
    set(
        "auto_start_paused_at_startup",
        json!(settings.auto_start_paused_at_startup),
    )?;
    set(
        "duplicate_url_warning",
        json!(settings.duplicate_url_warning),
    )?;
    set(
        "file_collision_behavior",
        json!(match settings.file_collision_behavior {
            FileCollisionBehavior::Rename => "rename",
            FileCollisionBehavior::Overwrite => "overwrite",
            FileCollisionBehavior::Skip => "skip",
        }),
    )?;
    set(
        "theme_preference",
        json!(match settings.theme_preference {
            ThemePreference::System => "system",
            ThemePreference::Light => "light",
            ThemePreference::Dark => "dark",
        }),
    )?;
    set("seed_ratio_target", json!(settings.seed_ratio_target))?;
    set(
        "file_allocation_method",
        json!(match settings.file_allocation_method {
            FileAllocationMethod::Falloc => "falloc",
            FileAllocationMethod::None => "none",
            FileAllocationMethod::Prealloc => "prealloc",
            FileAllocationMethod::Trunc => "trunc",
        }),
    )?;
    set("max_tries", json!(settings.max_tries))?;
    set("retry_wait_seconds", json!(settings.retry_wait_seconds))?;
    set(
        "notifications_enabled",
        json!(settings.notifications_enabled),
    )?;

    Ok(())
}

pub fn default_settings() -> Settings {
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
        file_allocation_method: default_file_allocation_method(),
        max_tries: 5,
        retry_wait_seconds: 0,
        notifications_enabled: true,
    }
}

pub fn default_file_allocation_method() -> FileAllocationMethod {
    if cfg!(target_os = "macos") {
        FileAllocationMethod::None
    } else {
        FileAllocationMethod::Falloc
    }
}
