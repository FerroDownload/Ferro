use ferro_lib::services::db;
use ferro_lib::services::engine_polling::{EnginePollingService, LiveTaskStatus};
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{Task, TaskStatus};
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

fn sample_task(id: &str, gid: &str, status: TaskStatus) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some(gid.to_string()),
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

async fn setup_service() -> (EnginePollingService, TaskRepository) {
    let dir = match tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let db_path = dir.path().join("ferro.db");
    let pool = match db::connect_with_migrations(&db_path).await {
        Ok(pool) => pool,
        Err(error) => panic!("connect db error: {error:?}"),
    };
    let service = EnginePollingService::new(TaskRepository::new(pool.clone()));
    let repo = TaskRepository::new(pool);
    (service, repo)
}

#[tokio::test]
async fn import_external_tasks_skips_known_gids() {
    let (service, _repo) = setup_service().await;
    let existing = sample_task("task-1", "gid-1", TaskStatus::Waiting);
    let _ = match service
        .import_external_tasks(std::slice::from_ref(&existing))
        .await
    {
        Ok(count) => count,
        Err(error) => panic!("import existing error: {error:?}"),
    };

    let new_task = sample_task("task-2", "gid-2", TaskStatus::Waiting);
    let inserted = match service.import_external_tasks(&[existing, new_task]).await {
        Ok(count) => count,
        Err(error) => panic!("import external error: {error:?}"),
    };

    assert_eq!(inserted, 1);
}

#[tokio::test]
async fn reconcile_readds_only_pending_sqlite_tasks_absent_from_live_aria2() {
    let (service, repo) = setup_service().await;
    let missing_active = sample_task("missing-active", "gid-missing", TaskStatus::Active);
    let restored_waiting = sample_task("restored-waiting", "gid-live", TaskStatus::Waiting);
    let completed_history = sample_task("completed-history", "gid-history", TaskStatus::Complete);
    repo.create(&missing_active).await.expect("create missing");
    repo.create(&restored_waiting).await.expect("create restored");
    repo.create(&completed_history).await.expect("create history");

    let live_tasks = vec![sample_task("live-waiting", "gid-live", TaskStatus::Waiting)];
    let readded_ids = Arc::new(Mutex::new(Vec::new()));
    let readded_ids_handle = Arc::clone(&readded_ids);

    let result = service
        .reconcile_session_restore(&live_tasks, move |task| {
            let readded_ids_handle = Arc::clone(&readded_ids_handle);
            async move {
                readded_ids_handle
                    .lock()
                    .expect("readded ids")
                    .push(task.id.clone());
                Ok(format!("new-{}", task.id))
            }
        })
        .await
        .expect("reconcile");

    assert_eq!(result.readded_missing_tasks, 1);
    assert_eq!(result.imported_orphan_tasks, 0);
    assert_eq!(
        *readded_ids.lock().expect("readded ids"),
        vec!["missing-active".to_string()],
    );
    assert_eq!(
        repo.get("missing-active")
            .await
            .expect("get missing")
            .expect("missing task")
            .aria2_gid,
        Some("new-missing-active".to_string()),
    );
    assert_eq!(
        repo.get("completed-history")
            .await
            .expect("get history")
            .expect("history task")
            .aria2_gid,
        Some("gid-history".to_string()),
    );
}

#[tokio::test]
async fn reconcile_imports_aria2_only_tasks_as_orphans() {
    let (service, repo) = setup_service().await;
    repo.create(&sample_task("known", "gid-known", TaskStatus::Waiting))
        .await
        .expect("create known");
    let live_tasks = vec![
        sample_task("known-live", "gid-known", TaskStatus::Waiting),
        sample_task("orphan-live", "gid-orphan", TaskStatus::Active),
    ];

    let result = service
        .reconcile_session_restore(&live_tasks, |_task| async {
            panic!("no missing SQLite task should be re-added")
        })
        .await
        .expect("reconcile");

    assert_eq!(result.readded_missing_tasks, 0);
    assert_eq!(result.imported_orphan_tasks, 1);
    let tasks = repo.list().await.expect("list tasks");
    let orphan = tasks
        .iter()
        .find(|task| task.aria2_gid.as_deref() == Some("gid-orphan"))
        .expect("imported orphan");
    assert!(orphan.orphan_imported);
}

#[tokio::test]
async fn apply_live_statuses_updates_progress_and_terminal_state() {
    let (service, repo) = setup_service().await;
    let waiting = sample_task("task-active", "gid-active", TaskStatus::Waiting);
    let pending_complete = sample_task("task-complete", "gid-complete", TaskStatus::Active);
    repo.create(&waiting).await.expect("create waiting");
    repo.create(&pending_complete)
        .await
        .expect("create complete");

    let updated = service
        .apply_live_statuses(&[
            LiveTaskStatus {
                gid: "gid-active".to_string(),
                status: "active".to_string(),
                total_length: 1000,
                completed_length: 250,
                download_speed: 128,
                upload_speed: 0,
                upload_length: 0,
                error_message: None,
            },
            LiveTaskStatus {
                gid: "gid-complete".to_string(),
                status: "complete".to_string(),
                total_length: 1000,
                completed_length: 1000,
                download_speed: 0,
                upload_speed: 0,
                upload_length: 0,
                error_message: None,
            },
        ])
        .await
        .expect("apply statuses");

    assert_eq!(updated, 2);

    let active = repo
        .get("task-active")
        .await
        .expect("get active")
        .expect("active task");
    assert_eq!(active.status, TaskStatus::Active);
    assert_eq!(active.progress_percent, 25.0);
    assert_eq!(active.downloaded_bytes, 250);
    assert_eq!(active.total_bytes, 1000);
    assert_eq!(active.download_speed_bps, 128);
    assert_eq!(active.completed_at, None);

    let complete = repo
        .get("task-complete")
        .await
        .expect("get complete")
        .expect("complete task");
    assert_eq!(complete.status, TaskStatus::Complete);
    assert_eq!(complete.progress_percent, 100.0);
    assert_eq!(complete.downloaded_bytes, 1000);
    assert!(complete.completed_at.is_some());
}
