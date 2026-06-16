use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use ferro_lib::services::settings_applier::{
    apply_settings_policy, GlobalOptionClient, SettingsApplicationResult,
};
use ferro_lib::state::models::{
    FileAllocationMethod, FileCollisionBehavior, Settings, ThemePreference,
};
use serde_json::Value as JsonValue;

#[derive(Clone, Default)]
struct RecordingGlobalOptionClient {
    calls: Arc<Mutex<Vec<JsonValue>>>,
}

impl GlobalOptionClient for RecordingGlobalOptionClient {
    fn change_global_option<'a>(
        &'a self,
        options: JsonValue,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
        self.calls.lock().expect("calls").push(options);
        Box::pin(async { Ok("OK".to_string()) })
    }
}

fn base_settings() -> Settings {
    Settings {
        download_directory: "C:/Users/Test/Downloads".to_string(),
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
fn settings_policy_applies_live_engine_global_options_and_reports_scopes() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let previous = base_settings();
    let mut next = previous.clone();
    next.max_concurrent_downloads = 8;
    next.max_connections_per_task = 32;
    next.global_download_limit_bps = Some(250_000);
    next.global_upload_limit_bps = Some(100_000);
    next.max_tries = 9;
    next.retry_wait_seconds = 30;
    next.dht_enabled = true;
    next.pex_enabled = true;
    next.close_to_tray = false;
    next.notifications_enabled = false;
    next.download_directory = "D:/Downloads".to_string();
    next.file_collision_behavior = FileCollisionBehavior::Overwrite;
    next.seed_ratio_target = 2.5;
    next.file_allocation_method = FileAllocationMethod::Prealloc;

    let client = RecordingGlobalOptionClient::default();

    let result = runtime
        .block_on(apply_settings_policy(&client, &previous, &next))
        .expect("apply settings policy");

    assert_eq!(
        result,
        SettingsApplicationResult {
            live_app_changes: vec!["close_to_tray", "notifications_enabled"],
            live_engine_global_changes: vec![
                "max_concurrent_downloads",
                "max_connections_per_task",
                "global_download_limit_bps",
                "global_upload_limit_bps",
                "dht_enabled",
                "pex_enabled",
                "max_tries",
                "retry_wait_seconds",
            ],
            future_download_changes: vec![
                "download_directory",
                "file_collision_behavior",
                "seed_ratio_target",
                "file_allocation_method",
            ],
        }
    );

    let calls = client.calls.lock().expect("calls");
    assert_eq!(calls.len(), 1);
    let options = calls[0].as_object().expect("options object");
    assert_eq!(options["max-concurrent-downloads"], "8");
    assert_eq!(options["max-connection-per-server"], "32");
    assert_eq!(options["split"], "32");
    assert_eq!(options["max-overall-download-limit"], "250000");
    assert_eq!(options["max-overall-upload-limit"], "100000");
    assert_eq!(options["enable-dht"], "true");
    assert_eq!(options["enable-dht6"], "true");
    assert_eq!(options["enable-peer-exchange"], "true");
    assert_eq!(options["max-tries"], "9");
    assert_eq!(options["retry-wait"], "30");
}

#[test]
fn settings_policy_skips_engine_call_when_only_future_download_settings_change() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let previous = base_settings();
    let mut next = previous.clone();
    next.download_directory = "D:/Downloads".to_string();

    let client = RecordingGlobalOptionClient::default();

    let result = runtime
        .block_on(apply_settings_policy(&client, &previous, &next))
        .expect("apply settings policy");

    assert_eq!(result.live_engine_global_changes, Vec::<&'static str>::new());
    assert!(client.calls.lock().expect("calls").is_empty());
}
