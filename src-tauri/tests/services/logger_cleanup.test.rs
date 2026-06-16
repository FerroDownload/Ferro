use std::fs::File;
use std::time::{Duration, SystemTime};

use ferro_lib::services::logger_cleanup::{cleanup_old_log_files, LOG_RETENTION_DAYS};

fn touch(path: &std::path::Path, modified_at: SystemTime) {
    let file = File::create(path).expect("create log file");
    file.set_modified(modified_at)
        .expect("set modified timestamp");
}

#[test]
fn deletes_log_files_older_than_retention_window() {
    let dir = tempfile::tempdir().expect("temp dir");
    let now = SystemTime::UNIX_EPOCH + Duration::from_secs(90 * 24 * 60 * 60);
    let old_log = dir.path().join("ferro.log.1");
    let fresh_log = dir.path().join("ferro.log");

    touch(
        &old_log,
        now - Duration::from_secs((LOG_RETENTION_DAYS + 1) * 24 * 60 * 60),
    );
    touch(&fresh_log, now - Duration::from_secs(2 * 24 * 60 * 60));

    let summary = cleanup_old_log_files(dir.path(), now).expect("cleanup logs");

    assert_eq!(summary.deleted_files, 1);
    assert!(!old_log.exists());
    assert!(fresh_log.exists());
}

#[test]
fn ignores_directories_when_cleaning_log_dir() {
    let dir = tempfile::tempdir().expect("temp dir");
    let now = SystemTime::UNIX_EPOCH + Duration::from_secs(90 * 24 * 60 * 60);
    let nested = dir.path().join("nested");
    std::fs::create_dir(&nested).expect("create nested dir");

    let summary = cleanup_old_log_files(dir.path(), now).expect("cleanup logs");

    assert_eq!(summary.deleted_files, 0);
    assert!(nested.exists());
}
