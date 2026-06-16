use std::cell::RefCell;
use std::path::{Path, PathBuf};

use ferro_lib::services::db::{self, DbRecoveryNotifier};
use tempfile::tempdir;

#[derive(Default)]
struct RecordingRecoveryNotifier {
    backups: RefCell<Vec<PathBuf>>,
}

impl DbRecoveryNotifier for RecordingRecoveryNotifier {
    fn database_recreated(&self, backup_path: &Path) -> Result<(), String> {
        self.backups.borrow_mut().push(backup_path.to_path_buf());
        Ok(())
    }
}

#[tokio::test]
async fn corrupt_database_is_renamed_and_recreated_with_migrations() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    std::fs::write(&db_path, b"not a sqlite database").expect("write corrupt db");
    let notifier = RecordingRecoveryNotifier::default();

    let pool = db::connect_with_migrations_and_recovery(&db_path, &notifier)
        .await
        .expect("recover corrupt database");

    let table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks';",
    )
    .fetch_optional(&pool)
    .await
    .expect("query recreated schema");

    assert_eq!(table.as_deref(), Some("tasks"));

    let backups = notifier.backups.borrow();
    assert_eq!(backups.len(), 1);
    let backup_path = backups.first().expect("backup path");
    assert_eq!(backup_path.parent(), Some(dir.path()));
    assert!(
        backup_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("ferro.db.corrupt."))
    );
    assert_eq!(
        std::fs::read(backup_path).expect("read corrupt backup"),
        b"not a sqlite database"
    );
    assert!(db_path.exists());
}
