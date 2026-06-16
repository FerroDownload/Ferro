use std::path::Path;

use ferro_lib::services::db;
use sqlx::SqlitePool;
use tempfile::tempdir;

async fn open_with_temp_path() -> (tempfile::TempDir, SqlitePool) {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect(&db_path).await.expect("connect db");
    (dir, pool)
}

#[tokio::test]
async fn connect_enables_foreign_keys() {
    let (_dir, pool) = open_with_temp_path().await;
    let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys;")
        .fetch_one(&pool)
        .await
        .expect("foreign_keys pragma");

    assert_eq!(foreign_keys, 1);
}

#[tokio::test]
async fn connect_with_migrations_creates_schema() {
    let dir = tempdir().expect("temp dir");
    let db_path = dir.path().join("ferro.db");
    let pool = db::connect_with_migrations(&db_path)
        .await
        .expect("connect with migrations");

    let table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks';",
    )
    .fetch_optional(&pool)
    .await
    .expect("query schema");

    assert_eq!(table.as_deref(), Some("tasks"));
}

#[tokio::test]
async fn connect_creates_parent_directory() {
    let dir = tempdir().expect("temp dir");
    let nested_path = dir.path().join("nested").join("ferro.db");
    let _pool = db::connect(Path::new(&nested_path))
        .await
        .expect("connect nested path");

    assert!(nested_path.exists());
}
