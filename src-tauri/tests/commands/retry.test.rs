use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use ferro_lib::commands::{engine, tasks, AppState};
use ferro_lib::engine::engine_manager::{Aria2Launcher, EngineConfig, EngineManager};
use ferro_lib::services::retry_service::{RetryRpcClient, RetrySettings};
use ferro_lib::services::db;
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{Task, TaskStatus};
use serde_json::Value as JsonValue;

fn create_engine_state() -> engine::EngineState {
    let engine_config = EngineConfig {
        rpc_host: "127.0.0.1".to_string(),
        rpc_secret: None,
        config_path: PathBuf::from("C:/Ferro/aria2.conf"),
        download_dir: PathBuf::from("C:/Users/Test/Downloads"),
        max_concurrent_downloads: 5,
        max_connections_per_task: 16,
        session_path: PathBuf::from("C:/Ferro/aria2.session"),
        session_save_interval_seconds: 60,
        file_allocation: "falloc".to_string(),
        dht_enabled: false,
        pex_enabled: false,
        binary_path: PathBuf::from("aria2c"),
    };
    let manager = EngineManager::new(engine_config, Aria2Launcher);
    engine::EngineState::new(manager)
}

fn sample_task(id: &str) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some("gid-old".to_string()),
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path: "C:/Users/Test/Downloads/file.iso".to_string(),
        status: TaskStatus::Error,
        progress_percent: 42.0,
        downloaded_bytes: 420,
        total_bytes: 1024,
        download_speed_bps: 12,
        upload_speed_bps: 0,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: Some("2026-02-05T00:00:00Z".to_string()),
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: Some("network failure".to_string()),
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[derive(Clone)]
struct CommandRetryClient {
    gids: Arc<Mutex<Vec<String>>>,
}

impl CommandRetryClient {
    fn new() -> Self {
        Self {
            gids: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl RetryRpcClient for CommandRetryClient {
    fn add_uri(
        &self,
        _source_uri: String,
        _options: JsonValue,
    ) -> ferro_lib::services::retry_service::RetryFuture<'_> {
        let gids = Arc::clone(&self.gids);
        Box::pin(async move {
            gids.lock().expect("gids").push("e2e-retry-uri".to_string());
            Ok("e2e-retry-uri".to_string())
        })
    }

    fn add_torrent(
        &self,
        _encoded: String,
        _options: JsonValue,
    ) -> ferro_lib::services::retry_service::RetryFuture<'_> {
        Box::pin(async { Ok("e2e-retry-torrent".to_string()) })
    }
}

#[test]
fn retry_task_command_updates_existing_task() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");

    let dir = tempfile::tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let pool = runtime
        .block_on(db::connect_with_migrations(&db_path))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let mut task = sample_task("task-1");
    task.destination_path = dir.path().join("file.iso").to_string_lossy().to_string();
    runtime.block_on(repo.create(&task)).expect("create task");

    let app_state = AppState::new(pool.clone(), create_engine_state());
    let client = CommandRetryClient::new();

    let retried = runtime
        .block_on(tasks::retry_task_with_settings(
            client,
            &app_state,
            "task-1".to_string(),
            RetrySettings::default(),
        ))
        .expect("retry task");
    assert_eq!(retried.status, TaskStatus::Waiting);
    assert_eq!(retried.aria2_gid.as_deref(), Some("e2e-retry-uri"));
    assert_eq!(retried.completed_at, None);
    assert_eq!(retried.error_message, None);

    let persisted = runtime
        .block_on(TaskRepository::new(pool).get("task-1"))
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.status, TaskStatus::Waiting);
    assert_eq!(persisted.aria2_gid.as_deref(), Some("e2e-retry-uri"));

    std::env::remove_var("FERRO_DB_IN_MEMORY");
}
