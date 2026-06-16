use ferro_lib::services::db;
use ferro_lib::services::engine_polling::EnginePollingService;
use ferro_lib::services::task_repository::TaskRepository;
use ferro_lib::services::torrent_storage::load_metadata_from_dir;
use ferro_lib::state::models::{Task, TaskStatus};
use serde_json::json;
use tempfile::tempdir;

fn metadata_waiting_task(id: &str, gid: &str, destination_path: String) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some(gid.to_string()),
        source_uri: "magnet:?xt=urn:btih:abcd".to_string(),
        display_name: "Magnet metadata".to_string(),
        destination_path,
        status: TaskStatus::Waiting,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: true,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[tokio::test]
async fn remaps_metadata_fetch_gid_to_paused_torrent_gid_and_persists_metadata() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect_with_migrations(&db_path)
        .await
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = metadata_waiting_task(
        "task-1",
        "metadata-gid",
        dir.path().join("Example").to_string_lossy().to_string(),
    );
    repo.create(&task).await.expect("create task");

    let service = EnginePollingService::new(TaskRepository::new(pool.clone()));
    let metadata_dir = dir.path().join("metadata");
    let resolved = service
        .resolve_magnet_metadata(
            "metadata-gid",
            &json!({
                "gid": "paused-gid",
                "infoHash": "abcd",
                "totalLength": "2048",
                "connections": "2",
                "numSeeders": "1",
                "bittorrent": {
                    "info": { "name": "Example" },
                    "announceList": [["udp://tracker.example"]]
                }
            }),
            &[
                json!({
                    "index": "1",
                    "path": "Example/file-a.bin",
                    "length": "1024",
                    "completedLength": "0",
                    "selected": "true"
                }),
                json!({
                    "index": "2",
                    "path": "Example/file-b.bin",
                    "length": "1024",
                    "completedLength": "0",
                    "selected": "true"
                }),
            ],
            &metadata_dir,
        )
        .await
        .expect("resolve magnet metadata")
        .expect("metadata resolved");

    assert_eq!(resolved.task_id, "task-1");
    assert_eq!(resolved.paused_gid, "paused-gid");
    assert_eq!(resolved.metadata.info_hash, "abcd");
    assert_eq!(resolved.metadata.name, "Example");

    let persisted = TaskRepository::new(pool)
        .get("task-1")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.aria2_gid.as_deref(), Some("paused-gid"));
    assert_eq!(persisted.status, TaskStatus::Paused);
    assert_eq!(persisted.display_name, "Example");
    assert_eq!(persisted.total_bytes, 2048);
    assert_eq!(persisted.torrent_info_hash.as_deref(), Some("abcd"));
    assert_eq!(persisted.selected_files, None);

    let stored = load_metadata_from_dir(&metadata_dir, "abcd").expect("load metadata");
    assert_eq!(stored, resolved.metadata);
}

#[tokio::test]
async fn ignores_magnet_status_until_bittorrent_info_is_available() {
    std::env::set_var("FERRO_DB_IN_MEMORY", "1");
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect_with_migrations(&db_path)
        .await
        .expect("connect db");
    let repo = TaskRepository::new(pool.clone());
    let task = metadata_waiting_task(
        "task-2",
        "metadata-gid",
        dir.path().join("Example").to_string_lossy().to_string(),
    );
    repo.create(&task).await.expect("create task");

    let service = EnginePollingService::new(TaskRepository::new(pool.clone()));
    let resolved = service
        .resolve_magnet_metadata(
            "metadata-gid",
            &json!({
                "gid": "metadata-gid",
                "infoHash": "",
                "totalLength": "0",
                "bittorrent": {}
            }),
            &[],
            &dir.path().join("metadata"),
        )
        .await
        .expect("resolve magnet metadata");

    assert!(resolved.is_none());
    let persisted = TaskRepository::new(pool)
        .get("task-2")
        .await
        .expect("get task")
        .expect("persisted task");
    assert_eq!(persisted.aria2_gid.as_deref(), Some("metadata-gid"));
    assert_eq!(persisted.torrent_info_hash, None);
}
