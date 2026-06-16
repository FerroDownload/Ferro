use sqlx::{Row, SqlitePool};

use crate::state::models::{Task, TaskStatus};

pub struct TaskRepository {
    pool: SqlitePool,
}

impl TaskRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, task: &Task) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO tasks (
              id,
              aria2_gid,
              source_uri,
              display_name,
              destination_path,
              status,
              progress_percent,
              downloaded_bytes,
              total_bytes,
              download_speed_bps,
              upload_speed_bps,
              created_at,
              updated_at,
              completed_at,
              uploaded_bytes,
              orphan_imported,
              error_message,
              is_torrent,
              torrent_info_hash,
              selected_files
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&task.id)
        .bind(&task.aria2_gid)
        .bind(&task.source_uri)
        .bind(&task.display_name)
        .bind(&task.destination_path)
        .bind(task_status_to_str(task.status))
        .bind(task.progress_percent)
        .bind(task.downloaded_bytes)
        .bind(task.total_bytes)
        .bind(task.download_speed_bps)
        .bind(task.upload_speed_bps)
        .bind(&task.created_at)
        .bind(&task.updated_at)
        .bind(&task.completed_at)
        .bind(task.uploaded_bytes)
        .bind(if task.orphan_imported { 1 } else { 0 })
        .bind(&task.error_message)
        .bind(if task.is_torrent { 1 } else { 0 })
        .bind(&task.torrent_info_hash)
        .bind(
            task.selected_files
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|error| sqlx::Error::Encode(Box::new(error)))?,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update(&self, task: &Task) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE tasks
            SET aria2_gid = ?,
                source_uri = ?,
                display_name = ?,
                destination_path = ?,
                status = ?,
                progress_percent = ?,
                downloaded_bytes = ?,
                total_bytes = ?,
                download_speed_bps = ?,
                upload_speed_bps = ?,
                created_at = ?,
                updated_at = ?,
                completed_at = ?,
                uploaded_bytes = ?,
                orphan_imported = ?,
                error_message = ?,
                is_torrent = ?,
                torrent_info_hash = ?,
                selected_files = ?
            WHERE id = ?
            "#,
        )
        .bind(&task.aria2_gid)
        .bind(&task.source_uri)
        .bind(&task.display_name)
        .bind(&task.destination_path)
        .bind(task_status_to_str(task.status))
        .bind(task.progress_percent)
        .bind(task.downloaded_bytes)
        .bind(task.total_bytes)
        .bind(task.download_speed_bps)
        .bind(task.upload_speed_bps)
        .bind(&task.created_at)
        .bind(&task.updated_at)
        .bind(&task.completed_at)
        .bind(task.uploaded_bytes)
        .bind(if task.orphan_imported { 1 } else { 0 })
        .bind(&task.error_message)
        .bind(if task.is_torrent { 1 } else { 0 })
        .bind(&task.torrent_info_hash)
        .bind(
            task.selected_files
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|error| sqlx::Error::Encode(Box::new(error)))?,
        )
        .bind(&task.id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<Task>, sqlx::Error> {
        let row = sqlx::query("SELECT * FROM tasks WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        row.map(row_to_task).transpose()
    }

    pub async fn list(&self) -> Result<Vec<Task>, sqlx::Error> {
        let rows = sqlx::query("SELECT * FROM tasks ORDER BY created_at")
            .fetch_all(&self.pool)
            .await?;

        rows.into_iter().map(row_to_task).collect()
    }

    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM tasks WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

fn task_status_to_str(status: TaskStatus) -> &'static str {
    match status {
        TaskStatus::Active => "active",
        TaskStatus::Waiting => "waiting",
        TaskStatus::Paused => "paused",
        TaskStatus::Stopped => "stopped",
        TaskStatus::Complete => "complete",
        TaskStatus::Error => "error",
    }
}

fn parse_task_status(value: &str) -> Result<TaskStatus, sqlx::Error> {
    match value {
        "active" => Ok(TaskStatus::Active),
        "waiting" => Ok(TaskStatus::Waiting),
        "paused" => Ok(TaskStatus::Paused),
        "stopped" => Ok(TaskStatus::Stopped),
        "complete" => Ok(TaskStatus::Complete),
        "error" => Ok(TaskStatus::Error),
        _ => Err(sqlx::Error::ColumnDecode {
            index: "status".into(),
            source: Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "unknown task status",
            )),
        }),
    }
}

fn row_to_task(row: sqlx::sqlite::SqliteRow) -> Result<Task, sqlx::Error> {
    let status_value: String = row.try_get("status")?;
    let selected_files_json: Option<String> = row.try_get("selected_files")?;
    let selected_files: Option<Vec<String>> = selected_files_json
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;

    Ok(Task {
        id: row.try_get("id")?,
        aria2_gid: row.try_get("aria2_gid")?,
        source_uri: row.try_get("source_uri")?,
        display_name: row.try_get("display_name")?,
        destination_path: row.try_get("destination_path")?,
        status: parse_task_status(&status_value)?,
        progress_percent: row.try_get("progress_percent")?,
        downloaded_bytes: row.try_get("downloaded_bytes")?,
        total_bytes: row.try_get("total_bytes")?,
        download_speed_bps: row.try_get("download_speed_bps")?,
        upload_speed_bps: row.try_get("upload_speed_bps")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        completed_at: row.try_get("completed_at")?,
        uploaded_bytes: row.try_get("uploaded_bytes")?,
        orphan_imported: row.try_get::<i64, _>("orphan_imported")? == 1,
        error_message: row.try_get("error_message")?,
        is_torrent: row.try_get::<i64, _>("is_torrent")? == 1,
        torrent_info_hash: row.try_get("torrent_info_hash")?,
        selected_files,
    })
}
