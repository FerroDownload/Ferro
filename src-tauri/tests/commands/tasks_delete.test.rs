use std::path::PathBuf;

use ferro_lib::commands::{engine, tasks, AppState};
use ferro_lib::engine::engine_manager::{Aria2Launcher, EngineConfig, EngineManager};
use ferro_lib::services::db;
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{Task, TaskStatus};

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

fn sample_task(id: &str, status: TaskStatus, destination_path: String) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: None,
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path,
        status,
        progress_percent: 100.0,
        downloaded_bytes: 1024,
        total_bytes: 1024,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: Some("2026-02-05T00:00:00Z".to_string()),
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[test]
fn remove_task_with_state_hard_deletes_history_row() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempfile::tempdir().expect("temp dir");
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let pool = runtime
        .block_on(db::connect_with_migrations(&dir.path().join("ferro.db")))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = sample_task(
        "task-history",
        TaskStatus::Complete,
        dir.path().join("file.iso").to_string_lossy().to_string(),
    );
    runtime.block_on(repo.create(&task)).expect("create task");
    let state = AppState::new(pool.clone(), create_engine_state());

    runtime
        .block_on(tasks::remove_task_with_state(&state, "task-history".to_string()))
        .expect("remove task");

    let persisted = runtime
        .block_on(TaskRepository::new(pool).get("task-history"))
        .expect("get task");
    assert!(persisted.is_none());
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn remove_task_with_state_rejects_active_view_tasks() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempfile::tempdir().expect("temp dir");
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let pool = runtime
        .block_on(db::connect_with_migrations(&dir.path().join("ferro.db")))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = sample_task(
        "task-active",
        TaskStatus::Active,
        dir.path().join("file.iso").to_string_lossy().to_string(),
    );
    runtime.block_on(repo.create(&task)).expect("create task");
    let state = AppState::new(pool.clone(), create_engine_state());

    let error = runtime
        .block_on(tasks::remove_task_with_state(&state, "task-active".to_string()))
        .expect_err("active task deletion should fail");

    assert_eq!(error, "active tasks must be cancelled before deletion");
    assert!(
        runtime
            .block_on(TaskRepository::new(pool).get("task-active"))
            .expect("get task")
            .is_some()
    );
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn delete_task_with_files_moves_existing_payload_to_trash_and_deletes_row() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempfile::tempdir().expect("temp dir");
    let payload_path = dir.path().join("file.iso");
    std::fs::write(&payload_path, "payload").expect("write payload");
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let pool = runtime
        .block_on(db::connect_with_migrations(&dir.path().join("ferro.db")))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = sample_task(
        "task-with-file",
        TaskStatus::Stopped,
        payload_path.to_string_lossy().to_string(),
    );
    runtime.block_on(repo.create(&task)).expect("create task");
    let state = AppState::new(pool.clone(), create_engine_state());

    runtime
        .block_on(tasks::delete_task_with_files_with_state(
            &state,
            "task-with-file".to_string(),
        ))
        .expect("delete task with files");

    assert!(!payload_path.exists());
    assert!(
        runtime
            .block_on(TaskRepository::new(pool).get("task-with-file"))
            .expect("get task")
            .is_none()
    );
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn delete_task_with_files_allows_missing_payload_file() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempfile::tempdir().expect("temp dir");
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let pool = runtime
        .block_on(db::connect_with_migrations(&dir.path().join("ferro.db")))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = sample_task(
        "task-missing-file",
        TaskStatus::Error,
        dir.path().join("missing.iso").to_string_lossy().to_string(),
    );
    runtime.block_on(repo.create(&task)).expect("create task");
    let state = AppState::new(pool.clone(), create_engine_state());

    runtime
        .block_on(tasks::delete_task_with_files_with_state(
            &state,
            "task-missing-file".to_string(),
        ))
        .expect("delete missing file task");

    assert!(
        runtime
            .block_on(TaskRepository::new(pool).get("task-missing-file"))
            .expect("get task")
            .is_none()
    );
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}
