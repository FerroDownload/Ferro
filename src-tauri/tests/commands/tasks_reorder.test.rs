use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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

fn sample_task(id: &str, status: TaskStatus) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some(format!("gid-{id}")),
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path: "C:/Users/Test/Downloads/file.iso".to_string(),
        status,
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

#[derive(Clone, Debug, PartialEq, Eq)]
struct ReorderCall {
    gid: String,
    pos: i64,
    how: String,
}

#[derive(Clone)]
struct RecordingReorderClient {
    calls: Arc<Mutex<Vec<ReorderCall>>>,
}

impl RecordingReorderClient {
    fn new() -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn calls(&self) -> Vec<ReorderCall> {
        self.calls.lock().expect("calls").clone()
    }
}

impl tasks::QueueReorderRpcClient for RecordingReorderClient {
    fn change_position(
        &self,
        gid: String,
        pos: i64,
        how: String,
    ) -> tasks::QueueReorderFuture<'_> {
        let calls = Arc::clone(&self.calls);
        Box::pin(async move {
            calls.lock().expect("calls").push(ReorderCall { gid, pos, how });
            Ok(7)
        })
    }
}

fn create_state_with_task(
    runtime: &tokio::runtime::Runtime,
    task: Task,
) -> (tempfile::TempDir, sqlx::SqlitePool, AppState) {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempfile::tempdir().expect("temp dir");
    let pool = runtime
        .block_on(db::connect_with_migrations(&dir.path().join("ferro.db")))
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    runtime.block_on(repo.create(&task)).expect("create task");
    let state = AppState::new(pool.clone(), create_engine_state());
    (dir, pool, state)
}

#[test]
fn reorder_waiting_task_sets_absolute_position_with_pos_set() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let (_dir, _pool, state) =
        create_state_with_task(&runtime, sample_task("task-1", TaskStatus::Waiting));
    let client = RecordingReorderClient::new();

    let position = runtime
        .block_on(tasks::reorder_task_to_with_client(
            client.clone(),
            &state,
            "task-1".to_string(),
            3,
        ))
        .expect("reorder task");

    assert_eq!(position, 7);
    assert_eq!(
        client.calls(),
        vec![ReorderCall {
            gid: "gid-task-1".to_string(),
            pos: 3,
            how: "POS_SET".to_string(),
        }]
    );
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn reorder_waiting_task_clamps_negative_position_to_zero() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let (_dir, _pool, state) =
        create_state_with_task(&runtime, sample_task("task-2", TaskStatus::Waiting));
    let client = RecordingReorderClient::new();

    runtime
        .block_on(tasks::reorder_task_to_with_client(
            client.clone(),
            &state,
            "task-2".to_string(),
            -5,
        ))
        .expect("reorder task");

    assert_eq!(
        client.calls(),
        vec![ReorderCall {
            gid: "gid-task-2".to_string(),
            pos: 0,
            how: "POS_SET".to_string(),
        }]
    );
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn reorder_rejects_non_waiting_tasks_before_rpc() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let (_dir, _pool, state) =
        create_state_with_task(&runtime, sample_task("task-3", TaskStatus::Active));
    let client = RecordingReorderClient::new();

    let error = runtime
        .block_on(tasks::reorder_task_to_with_client(
            client.clone(),
            &state,
            "task-3".to_string(),
            0,
        ))
        .expect_err("active task reorder should fail");

    assert_eq!(error, "only waiting tasks can be reordered");
    assert!(client.calls().is_empty());
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn reorder_requires_aria2_gid() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let mut task = sample_task("task-4", TaskStatus::Waiting);
    task.aria2_gid = None;
    let (_dir, _pool, state) = create_state_with_task(&runtime, task);
    let client = RecordingReorderClient::new();

    let error = runtime
        .block_on(tasks::reorder_task_to_with_client(
            client.clone(),
            &state,
            "task-4".to_string(),
            0,
        ))
        .expect_err("missing gid should fail");

    assert_eq!(error, "task has no aria2 gid");
    assert!(client.calls().is_empty());
    std::env::remove_var("FERRO_DB_IN_MEMORY");
}

#[test]
fn order_waiting_tasks_follows_engine_queue_order_and_keeps_other_slots() {
    let tasks = vec![
        sample_task("x", TaskStatus::Active),
        sample_task("a", TaskStatus::Waiting),
        sample_task("b", TaskStatus::Waiting),
        sample_task("c", TaskStatus::Waiting),
        sample_task("y", TaskStatus::Paused),
    ];
    let waiting_order = vec![
        "gid-c".to_string(),
        "gid-a".to_string(),
        "gid-b".to_string(),
    ];

    let ordered = tasks::order_waiting_tasks(tasks, &waiting_order);

    let ids: Vec<&str> = ordered.iter().map(|task| task.id.as_str()).collect();
    assert_eq!(ids, vec!["x", "c", "a", "b", "y"]);
}

#[test]
fn order_waiting_tasks_keeps_unranked_last_and_ignores_empty_order() {
    let tasks = vec![
        sample_task("a", TaskStatus::Waiting),
        sample_task("b", TaskStatus::Waiting),
        sample_task("c", TaskStatus::Waiting),
    ];

    let ordered = tasks::order_waiting_tasks(tasks.clone(), &["gid-b".to_string()]);
    let ids: Vec<&str> = ordered.iter().map(|task| task.id.as_str()).collect();
    assert_eq!(ids, vec!["b", "a", "c"]);

    let unchanged = tasks::order_waiting_tasks(tasks, &[]);
    let ids: Vec<&str> = unchanged.iter().map(|task| task.id.as_str()).collect();
    assert_eq!(ids, vec!["a", "b", "c"]);
}
