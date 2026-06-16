use ferro_lib::services::db;
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{Task, TaskStatus};
use tempfile::tempdir;

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

async fn setup_repository() -> TaskRepository {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect_with_migrations(&db_path)
        .await
        .expect("connect db");
    TaskRepository::new(pool)
}

#[tokio::test]
async fn create_and_get_task() {
    let repo = setup_repository().await;
    let task = sample_task("task-1");

    repo.create(&task).await.expect("create task");
    let fetched = repo.get("task-1").await.expect("get task");

    assert_eq!(fetched, Some(task));
}

#[tokio::test]
async fn list_tasks_returns_rows() {
    let repo = setup_repository().await;
    repo.create(&sample_task("task-1"))
        .await
        .expect("create task-1");
    repo.create(&sample_task("task-2"))
        .await
        .expect("create task-2");

    let tasks = repo.list().await.expect("list tasks");
    assert_eq!(tasks.len(), 2);
}

#[tokio::test]
async fn update_task_persists_changes() {
    let repo = setup_repository().await;
    let mut task = sample_task("task-1");
    repo.create(&task).await.expect("create task");

    task.status = TaskStatus::Paused;
    task.progress_percent = 12.5;
    repo.update(&task).await.expect("update task");

    let fetched = repo.get("task-1").await.expect("get task");
    assert_eq!(fetched, Some(task));
}

#[tokio::test]
async fn delete_task_removes_row() {
    let repo = setup_repository().await;
    repo.create(&sample_task("task-1"))
        .await
        .expect("create task");

    repo.delete("task-1").await.expect("delete task");
    let fetched = repo.get("task-1").await.expect("get task");

    assert!(fetched.is_none());
}
