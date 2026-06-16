use ferro_lib::commands::tasks;
use ferro_lib::state::models::FileCollisionBehavior;

#[test]
fn add_task_record_preserves_url_embedded_credentials_in_source_uri() {
    let source_uri = "https://user:pass@example.com/private/file.zip".to_string();

    let task = tasks::build_pending_add_task_record(
        "gid-1".to_string(),
        source_uri.clone(),
        "file.zip".to_string(),
        "C:/Downloads/file.zip".to_string(),
        "2026-05-01T00:00:00Z".to_string(),
    );

    assert_eq!(task.source_uri, source_uri);
    assert_eq!(task.display_name, "file.zip");
    assert_eq!(task.aria2_gid.as_deref(), Some("gid-1"));
}

#[test]
fn direct_download_destination_renames_when_active_task_already_reserves_name() {
    let dir = tempfile::tempdir().expect("temp dir");
    let reserved = [dir.path().join("file.zip")];

    let destination = tasks::prepare_direct_download_destination_with_reserved_paths(
        dir.path().to_str().expect("dir"),
        "file.zip",
        FileCollisionBehavior::Rename,
        &reserved,
    )
    .expect("prepared")
    .expect("usable destination");

    assert_eq!(destination.output_name, "file(1).zip");
    assert_eq!(
        destination.destination_path,
        dir.path().join("file(1).zip").to_string_lossy()
    );
}
