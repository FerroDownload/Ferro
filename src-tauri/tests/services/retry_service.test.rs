use std::path::Path;
use std::sync::{Arc, Mutex};

use ferro_lib::services::db;
use ferro_lib::services::retry_service::{RetryRpcClient, RetryService, RetrySettings};
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::state::models::{Task, TaskStatus, TorrentFile, TorrentMetadata};
use serde_json::json;
use sqlx::SqlitePool;
use tempfile::tempdir;

#[derive(Debug, Clone, PartialEq)]
enum MockCall {
    AddUri { source_uri: String, options: serde_json::Value },
    AddTorrent { encoded: String, options: serde_json::Value },
}

#[derive(Clone)]
struct MockRetryClient {
    calls: Arc<Mutex<Vec<MockCall>>>,
    uri_result: Result<String, String>,
    torrent_result: Result<String, String>,
}

impl MockRetryClient {
    fn with_uri_result(uri_result: Result<String, String>) -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            uri_result,
            torrent_result: Ok("torrent-gid".to_string()),
        }
    }

    fn with_torrent_result(torrent_result: Result<String, String>) -> Self {
        Self {
            calls: Arc::new(Mutex::new(Vec::new())),
            uri_result: Ok("uri-gid".to_string()),
            torrent_result,
        }
    }

    fn calls(&self) -> Vec<MockCall> {
        self.calls.lock().expect("calls").clone()
    }
}

impl RetryRpcClient for MockRetryClient {
    fn add_uri(
        &self,
        source_uri: String,
        options: serde_json::Value,
    ) -> ferro_lib::services::retry_service::RetryFuture<'_> {
        let calls = Arc::clone(&self.calls);
        let result = self.uri_result.clone();
        Box::pin(async move {
            calls
                .lock()
                .expect("calls")
                .push(MockCall::AddUri { source_uri, options });
            result
        })
    }

    fn add_torrent(
        &self,
        encoded: String,
        options: serde_json::Value,
    ) -> ferro_lib::services::retry_service::RetryFuture<'_> {
        let calls = Arc::clone(&self.calls);
        let result = self.torrent_result.clone();
        Box::pin(async move {
            calls
                .lock()
                .expect("calls")
                .push(MockCall::AddTorrent { encoded, options });
            result
        })
    }
}

fn sample_task(id: &str, destination_path: String) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some("gid-old".to_string()),
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path,
        status: TaskStatus::Error,
        progress_percent: 42.0,
        downloaded_bytes: 420,
        total_bytes: 1000,
        download_speed_bps: 99,
        upload_speed_bps: 7,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: Some("2026-02-05T00:00:00Z".to_string()),
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: Some("previous failure".to_string()),
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

async fn setup_repository() -> (TaskRepository, SqlitePool, tempfile::TempDir) {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect_with_migrations(&db_path)
        .await
        .expect("connect db");
    (TaskRepository::new(pool.clone()), pool, dir)
}

fn write_metadata(metadata_dir: &Path, metadata: &TorrentMetadata) {
    std::fs::create_dir_all(metadata_dir).expect("create metadata dir");
    std::fs::write(
        metadata_dir.join(format!("{}.json", metadata.info_hash)),
        serde_json::to_string(metadata).expect("serialize metadata"),
    )
    .expect("write metadata");
}

#[tokio::test]
async fn retry_readds_direct_download_and_preserves_progress_snapshot() {
    let (repo, pool, dir) = setup_repository().await;
    let destination_path = dir.path().join("file.iso").to_string_lossy().to_string();
    let task = sample_task("task-1", destination_path.clone());
    repo.create(&task).await.expect("create task");

    let client = MockRetryClient::with_uri_result(Ok("gid-new".to_string()));
    let service = RetryService::new(repo, client.clone(), RetrySettings::default());

    let retried = service.retry_task("task-1").await.expect("retry task");

    assert_eq!(retried.status, TaskStatus::Waiting);
    assert_eq!(retried.aria2_gid.as_deref(), Some("gid-new"));
    assert_eq!(retried.created_at, task.created_at);
    assert_eq!(retried.completed_at, None);
    assert_eq!(retried.error_message, None);
    assert_eq!(retried.progress_percent, task.progress_percent);
    assert_eq!(retried.downloaded_bytes, task.downloaded_bytes);
    assert_eq!(retried.download_speed_bps, 0);
    assert_eq!(retried.upload_speed_bps, 0);

    assert_eq!(
        client.calls(),
        vec![MockCall::AddUri {
            source_uri: "https://example.com/file.iso".to_string(),
            options: json!({
                "dir": Path::new(&destination_path)
                    .parent()
                    .expect("parent")
                    .to_string_lossy()
                    .to_string(),
                "out": "file.iso",
            }),
        }]
    );

    let persisted = TaskRepository::new(pool)
        .get("task-1")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.aria2_gid.as_deref(), Some("gid-new"));
    assert_eq!(persisted.status, TaskStatus::Waiting);
}

#[tokio::test]
async fn retry_readds_direct_download_with_url_embedded_credentials_unchanged() {
    let (repo, _pool, dir) = setup_repository().await;
    let destination_path = dir.path().join("file.iso").to_string_lossy().to_string();
    let mut task = sample_task("task-credentials", destination_path);
    task.source_uri = "https://user:pass@example.com/private/file.iso?token=KeepCase".to_string();
    repo.create(&task).await.expect("create task");

    let client = MockRetryClient::with_uri_result(Ok("gid-new".to_string()));
    let service = RetryService::new(repo, client.clone(), RetrySettings::default());

    service
        .retry_task("task-credentials")
        .await
        .expect("retry task");

    let calls = client.calls();
    match calls.as_slice() {
        [MockCall::AddUri { source_uri, .. }] => {
            assert_eq!(source_uri, &task.source_uri);
        }
        other => panic!("expected one add_uri call, got {other:?}"),
    }
}

#[tokio::test]
async fn retry_uses_torrent_file_source_and_reapplies_saved_selection() {
    let (repo, pool, dir) = setup_repository().await;
    let torrent_path = dir.path().join("example.torrent");
    std::fs::write(&torrent_path, "torrent-bytes").expect("write torrent");
    let destination_path = dir.path().join("Example").to_string_lossy().to_string();

    let mut task = sample_task("task-2", destination_path);
    task.is_torrent = true;
    task.source_uri = torrent_path.to_string_lossy().to_string();
    task.display_name = "Example".to_string();
    task.torrent_info_hash = Some("abcd".to_string());
    task.selected_files = Some(vec!["Example/file-a.bin".to_string()]);
    repo.create(&task).await.expect("create task");

    let metadata_dir = dir.path().join("metadata");
    write_metadata(
        &metadata_dir,
        &TorrentMetadata {
            info_hash: "abcd".to_string(),
            name: "Example".to_string(),
            total_bytes: 2048,
            files: vec![
                TorrentFile {
                    index: 1,
                    path: "Example/file-a.bin".to_string(),
                    bytes: 1024,
                    completed_bytes: 0,
                    selected: true,
                },
                TorrentFile {
                    index: 2,
                    path: "Example/file-b.bin".to_string(),
                    bytes: 1024,
                    completed_bytes: 0,
                    selected: true,
                },
            ],
            trackers: vec!["udp://tracker".to_string()],
            peers: 0,
            seeders: 0,
        },
    );

    let client = MockRetryClient::with_torrent_result(Ok("gid-torrent-new".to_string()));
    let service = RetryService::new(
        repo,
        client.clone(),
        RetrySettings {
            seed_ratio_target: 1.5,
            metadata_dir: Some(metadata_dir),
        },
    );

    let retried = service.retry_task("task-2").await.expect("retry task");

    assert_eq!(retried.status, TaskStatus::Waiting);
    assert_eq!(retried.aria2_gid.as_deref(), Some("gid-torrent-new"));

    let calls = client.calls();
    assert_eq!(calls.len(), 1);
    match &calls[0] {
        MockCall::AddTorrent { encoded, options } => {
            assert_eq!(encoded, "dG9ycmVudC1ieXRlcw==");
            assert_eq!(
                *options,
                json!({
                    "dir": dir.path().to_string_lossy().to_string(),
                    "seed-ratio": "1.5",
                    "select-file": "1",
                })
            );
        }
        other => panic!("expected add_torrent call, got {other:?}"),
    }

    let persisted = TaskRepository::new(pool)
        .get("task-2")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.aria2_gid.as_deref(), Some("gid-torrent-new"));
    assert_eq!(persisted.error_message, None);
}

#[tokio::test]
async fn retry_fails_before_rpc_when_remaining_bytes_exceed_available_disk() {
    let (repo, pool, dir) = setup_repository().await;
    let destination_path = dir
        .path()
        .join("large")
        .join("file.iso")
        .to_string_lossy()
        .to_string();

    let mut task = sample_task("task-disk", destination_path);
    task.total_bytes = i64::MAX;
    task.downloaded_bytes = 0;
    repo.create(&task).await.expect("create task");

    let client = MockRetryClient::with_uri_result(Ok("gid-unexpected".to_string()));
    let service = RetryService::new(repo, client.clone(), RetrySettings::default());

    let error = service
        .retry_task("task-disk")
        .await
        .expect_err("retry should fail before rpc");

    assert!(
        error.to_string().starts_with("Insufficient disk space:"),
        "unexpected error: {error}"
    );
    assert!(client.calls().is_empty());

    let persisted = TaskRepository::new(pool)
        .get("task-disk")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.status, TaskStatus::Error);
    assert!(
        persisted
            .error_message
            .as_deref()
            .expect("error message")
            .starts_with("Insufficient disk space:")
    );
}

#[tokio::test]
async fn retry_rejects_torrent_when_stored_metadata_hash_changed() {
    let (repo, pool, dir) = setup_repository().await;
    let torrent_path = dir.path().join("example.torrent");
    std::fs::write(&torrent_path, "torrent-bytes").expect("write torrent");
    let destination_path = dir.path().join("Example").to_string_lossy().to_string();

    let mut task = sample_task("task-hash", destination_path);
    task.is_torrent = true;
    task.source_uri = torrent_path.to_string_lossy().to_string();
    task.display_name = "Example".to_string();
    task.torrent_info_hash = Some("abcd".to_string());
    repo.create(&task).await.expect("create task");

    let metadata_dir = dir.path().join("metadata");
    write_metadata(
        &metadata_dir,
        &TorrentMetadata {
            info_hash: "abcd".to_string(),
            name: "Example".to_string(),
            total_bytes: 2048,
            files: vec![],
            trackers: vec![],
            peers: 0,
            seeders: 0,
        },
    );
    std::fs::write(
        metadata_dir.join("abcd.json"),
        serde_json::to_string(&TorrentMetadata {
            info_hash: "efgh".to_string(),
            name: "Changed".to_string(),
            total_bytes: 2048,
            files: vec![],
            trackers: vec![],
            peers: 0,
            seeders: 0,
        })
        .expect("serialize metadata"),
    )
    .expect("overwrite metadata");

    let client = MockRetryClient::with_torrent_result(Ok("gid-unexpected".to_string()));
    let service = RetryService::new(
        repo,
        client.clone(),
        RetrySettings {
            seed_ratio_target: 1.0,
            metadata_dir: Some(metadata_dir),
        },
    );

    let error = service
        .retry_task("task-hash")
        .await
        .expect_err("retry should reject stale metadata");

    assert_eq!(
        error.to_string(),
        "stored torrent metadata no longer matches the task"
    );
    assert!(client.calls().is_empty());

    let persisted = TaskRepository::new(pool)
        .get("task-hash")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.status, TaskStatus::Error);
    assert_eq!(
        persisted.error_message.as_deref(),
        Some("stored torrent metadata no longer matches the task")
    );
}

#[tokio::test]
async fn retry_failure_updates_error_message_and_keeps_history_state() {
    let (repo, pool, dir) = setup_repository().await;
    let destination_path = dir.path().join("Example").to_string_lossy().to_string();

    let mut task = sample_task("task-3", destination_path);
    task.is_torrent = true;
    task.source_uri = "magnet:?xt=urn:btih:abcd".to_string();
    task.display_name = "Example".to_string();
    task.torrent_info_hash = Some("abcd".to_string());
    task.selected_files = Some(vec!["Example/missing.bin".to_string()]);
    let original_completed_at = task.completed_at.clone();
    repo.create(&task).await.expect("create task");

    let metadata_dir = dir.path().join("metadata");
    write_metadata(
        &metadata_dir,
        &TorrentMetadata {
            info_hash: "abcd".to_string(),
            name: "Example".to_string(),
            total_bytes: 2048,
            files: vec![TorrentFile {
                index: 1,
                path: "Example/file-a.bin".to_string(),
                bytes: 2048,
                completed_bytes: 0,
                selected: true,
            }],
            trackers: vec![],
            peers: 0,
            seeders: 0,
        },
    );

    let client = MockRetryClient::with_uri_result(Ok("gid-unexpected".to_string()));
    let service = RetryService::new(
        repo,
        client.clone(),
        RetrySettings {
            seed_ratio_target: 1.0,
            metadata_dir: Some(metadata_dir),
        },
    );

    let error = service.retry_task("task-3").await.expect_err("retry should fail");
    assert_eq!(error.to_string(), "saved file selection can no longer be applied");
    assert!(client.calls().is_empty());

    let persisted = TaskRepository::new(pool)
        .get("task-3")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.status, TaskStatus::Error);
    assert_eq!(persisted.completed_at, original_completed_at);
    assert_eq!(
        persisted.error_message.as_deref(),
        Some("saved file selection can no longer be applied")
    );
}
