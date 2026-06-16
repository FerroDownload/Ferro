use std::path::Path;

use chrono::Utc;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::services::migrations;

pub const DB_CORRUPTION_RECOVERED_EVENT: &str = "db:corruption_recovered";
pub const DB_CORRUPTION_RECOVERED_MESSAGE: &str = "Task history could not be loaded. A fresh database was created; active downloads will be recovered from the engine.";

#[derive(Debug)]
pub enum DbError {
    Io(std::io::Error),
    Sqlx(sqlx::Error),
    RecoveryNotification(String),
}

impl From<std::io::Error> for DbError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<sqlx::Error> for DbError {
    fn from(value: sqlx::Error) -> Self {
        Self::Sqlx(value)
    }
}

pub trait DbRecoveryNotifier {
    fn database_recreated(&self, backup_path: &Path) -> Result<(), String>;
}

#[derive(Debug, Clone, Copy)]
pub struct NoopDbRecoveryNotifier;

impl DbRecoveryNotifier for NoopDbRecoveryNotifier {
    fn database_recreated(&self, _backup_path: &Path) -> Result<(), String> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct TauriDbRecoveryNotifier {
    app: AppHandle,
}

impl TauriDbRecoveryNotifier {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl DbRecoveryNotifier for TauriDbRecoveryNotifier {
    fn database_recreated(&self, backup_path: &Path) -> Result<(), String> {
        self.app
            .emit(
                DB_CORRUPTION_RECOVERED_EVENT,
                serde_json::json!({
                    "message": DB_CORRUPTION_RECOVERED_MESSAGE,
                    "backup_path": backup_path.to_string_lossy(),
                }),
            )
            .map_err(|error| error.to_string())
    }
}

pub async fn connect(db_path: &Path) -> Result<SqlitePool, DbError> {
    if std::env::var("FERRO_DB_IN_MEMORY").is_ok() {
        // Ref: https://github.com/launchbadge/sqlx/blob/main/README.md
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;
        return Ok(pool);
    }
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Ref: https://context7.com/launchbadge/sqlx/llms.txt
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    Ok(pool)
}

pub async fn connect_with_migrations(db_path: &Path) -> Result<SqlitePool, DbError> {
    let pool = connect(db_path).await?;
    // Ref: https://context7.com/launchbadge/sqlx/llms.txt
    migrations::run_migrations(&pool).await?;
    Ok(pool)
}

pub async fn connect_with_migrations_and_recovery<N>(
    db_path: &Path,
    notifier: &N,
) -> Result<SqlitePool, DbError>
where
    N: DbRecoveryNotifier,
{
    match connect_and_migrate(db_path).await {
        Ok(pool) => Ok(pool),
        Err(error) if db_path.exists() && is_sqlite_corruption_error(&error) => {
            let backup_path = backup_corrupt_database(db_path)?;
            let pool = connect_and_migrate(db_path).await?;
            notifier
                .database_recreated(&backup_path)
                .map_err(DbError::RecoveryNotification)?;
            Ok(pool)
        }
        Err(error) => Err(error),
    }
}

async fn connect_and_migrate(db_path: &Path) -> Result<SqlitePool, DbError> {
    let pool = connect(db_path).await?;
    if let Err(error) = migrations::run_migrations(&pool).await {
        pool.close().await;
        return Err(DbError::Sqlx(error));
    }
    Ok(pool)
}

fn backup_corrupt_database(db_path: &Path) -> Result<std::path::PathBuf, DbError> {
    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("ferro.db");
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let mut backup_path = parent.join(format!("{file_name}.corrupt.{timestamp}"));

    for suffix in 1.. {
        if !backup_path.exists() {
            break;
        }
        backup_path = parent.join(format!("{file_name}.corrupt.{timestamp}.{suffix}"));
    }

    std::fs::rename(db_path, &backup_path)?;
    Ok(backup_path)
}

fn is_sqlite_corruption_error(error: &DbError) -> bool {
    let message = format!("{error:?}").to_ascii_lowercase();
    [
        "file is not a database",
        "database disk image is malformed",
        "malformed database schema",
    ]
    .iter()
    .any(|needle| message.contains(needle))
}
