use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use ferro_lib::engine::engine_manager::{build_aria2_args, EngineConfig};
use ferro_lib::services::settings_applier::{
    apply_bittorrent_global_options, build_bittorrent_global_options, GlobalOptionClient,
};
use ferro_lib::state::models::{
    FileAllocationMethod, FileCollisionBehavior, Settings, ThemePreference,
};
use serde_json::{json, Value as JsonValue};

fn base_config(root: &Path) -> EngineConfig {
    EngineConfig {
        rpc_host: "127.0.0.1".to_string(),
        rpc_secret: Some("secret".to_string()),
        config_path: root.join("state").join("aria2.conf"),
        download_dir: root.join("downloads"),
        max_concurrent_downloads: 5,
        max_connections_per_task: 16,
        session_path: root.join("state").join("aria2.session"),
        session_save_interval_seconds: 60,
        file_allocation: "falloc".to_string(),
        dht_enabled: false,
        pex_enabled: false,
        binary_path: PathBuf::from("aria2c"),
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
fn startup_args_disable_dht_and_pex_by_default() {
    let root = tempfile::tempdir().expect("temp dir");
    let config = base_config(root.path());

    let args = build_aria2_args(&config, 6881).expect("build args");

    assert!(args.contains(&"--enable-dht=false".to_string()));
    assert!(args.contains(&"--enable-dht6=false".to_string()));
    assert!(args.contains(&"--enable-peer-exchange=false".to_string()));
}

#[test]
fn startup_args_follow_bittorrent_privacy_settings() {
    let root = tempfile::tempdir().expect("temp dir");
    let mut config = base_config(root.path());
    config.dht_enabled = true;
    config.pex_enabled = true;

    let args = build_aria2_args(&config, 6881).expect("build args");

    assert!(args.contains(&"--enable-dht=true".to_string()));
    assert!(args.contains(&"--enable-dht6=true".to_string()));
    assert!(args.contains(&"--enable-peer-exchange=true".to_string()));
}

#[test]
fn runtime_global_options_map_dht_and_pex_settings_to_aria2_keys() {
    let mut settings = base_settings();
    settings.dht_enabled = true;
    settings.pex_enabled = false;

    let options = build_bittorrent_global_options(&settings);

    assert_eq!(
        options,
        json!({
            "enable-dht": "true",
            "enable-dht6": "true",
            "enable-peer-exchange": "false",
        }),
    );
}

struct RecordingClient {
    calls: Arc<Mutex<Vec<JsonValue>>>,
}

impl GlobalOptionClient for RecordingClient {
    fn change_global_option<'a>(
        &'a self,
        options: JsonValue,
    ) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
        Box::pin(async move {
            self.calls.lock().expect("calls").push(options);
            Ok("OK".to_string())
        })
    }
}

#[tokio::test]
async fn runtime_apply_invokes_aria2_change_global_option_once() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let client = RecordingClient {
        calls: Arc::clone(&calls),
    };
    let mut settings = base_settings();
    settings.dht_enabled = false;
    settings.pex_enabled = true;

    apply_bittorrent_global_options(&client, &settings)
        .await
        .expect("apply options");

    assert_eq!(
        *calls.lock().expect("calls"),
        vec![json!({
            "enable-dht": "false",
            "enable-dht6": "false",
            "enable-peer-exchange": "true",
        })],
    );
}
