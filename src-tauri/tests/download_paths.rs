use std::fs;

use ferro_lib::services::download_paths::{
    prepare_single_file_destination, resolve_collision_path, validate_multifile_destination,
    CollisionNoticeKind, CollisionResolution,
};
use ferro_lib::state::models::FileCollisionBehavior;

#[test]
fn returns_original_path_when_no_collision() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let path = dir.path().join("file.zip");

    let resolved = resolve_collision_path(&path, FileCollisionBehavior::Rename);

    assert_eq!(resolved, path);
}

#[test]
fn appends_suffix_when_collision_exists() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let path = dir.path().join("file.zip");
    if let Err(error) = fs::write(&path, "data") {
        panic!("write error: {error}");
    }

    let resolved = resolve_collision_path(&path, FileCollisionBehavior::Rename);

    assert_eq!(resolved, dir.path().join("file(1).zip"));
}

#[test]
fn overwrite_removes_existing_single_file_before_download_creation() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("file.zip");
    fs::write(&path, "old data").expect("write collision");

    let resolved = prepare_single_file_destination(&path, FileCollisionBehavior::Overwrite)
        .expect("overwrite collision should resolve");

    assert_eq!(resolved, CollisionResolution::UsePath(path.clone()));
    assert!(
        !path.exists(),
        "overwrite must remove the colliding file before aria2 writes to it"
    );
}

#[test]
fn skip_single_file_collision_does_not_create_download_and_keeps_existing_file() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("file.zip");
    fs::write(&path, "old data").expect("write collision");

    let resolved = prepare_single_file_destination(&path, FileCollisionBehavior::Skip)
        .expect("skip collision should produce a resolution");

    assert_eq!(
        resolved,
        CollisionResolution::Blocked {
            kind: CollisionNoticeKind::SkippedSingleFile,
            path: path.clone(),
            message: "File already exists; skipped creating the download.".to_string(),
        }
    );
    assert_eq!(
        fs::read_to_string(&path).expect("existing file"),
        "old data",
        "skip must not remove or modify the existing file"
    );
}

#[test]
fn multifile_collision_blocks_task_creation_for_any_collision_behavior() {
    let dir = tempfile::tempdir().expect("temp dir");
    let existing = dir.path().join("Album").join("track-01.flac");
    fs::create_dir_all(existing.parent().expect("parent")).expect("create parent");
    fs::write(&existing, "old data").expect("write collision");
    let missing = dir.path().join("Album").join("track-02.flac");

    for behavior in [
        FileCollisionBehavior::Rename,
        FileCollisionBehavior::Overwrite,
        FileCollisionBehavior::Skip,
    ] {
        let resolved =
            validate_multifile_destination(&[existing.clone(), missing.clone()], behavior)
                .expect("multi-file validation should return a collision notice");

        assert_eq!(
            resolved,
            CollisionResolution::Blocked {
                kind: CollisionNoticeKind::BlockedMultiFile,
                path: existing.clone(),
                message: "A selected file already exists; multi-file downloads with collisions are blocked in this version.".to_string(),
            }
        );
        assert!(existing.exists());
    }
}
