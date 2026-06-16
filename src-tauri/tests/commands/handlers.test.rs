use std::path::PathBuf;

use ferro_lib::engine::engine_manager::{Aria2Launcher, EngineConfig, EngineManager};
use ferro_lib::services::db;
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{EngineProcessState, Task, TaskStatus};

fn create_engine_manager() -> EngineManager<Aria2Launcher> {
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
    EngineManager::new(engine_config, Aria2Launcher)
}

fn sample_task(id: &str) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: None,
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path: "C:/Users/Test/Downloads/file.iso".to_string(),
        status: TaskStatus::Waiting,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 1024,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[test]
fn command_handler_state_returns_engine_status_and_tasks() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let db_path = dir.path().join("ferro.db");
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(runtime) => runtime,
        Err(error) => panic!("runtime error: {error}"),
    };
    let pool = match runtime.block_on(db::connect_with_migrations(&db_path)) {
        Ok(pool) => pool,
        Err(error) => panic!("db error: {error:?}"),
    };
    let repo = TaskRepository::new(pool.clone());
    let task = sample_task("task-1");
    let create_result = runtime.block_on(repo.create(&task));
    if let Err(error) = create_result {
        panic!("create task error: {error:?}");
    }

    let status = create_engine_manager().status();
    assert_eq!(status.process_state, EngineProcessState::Stopped);

    let tasks = runtime.block_on(repo.list()).expect("list tasks");
    assert_eq!(tasks.len(), 1);
}
