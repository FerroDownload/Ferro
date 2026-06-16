use std::collections::HashSet;
use std::future::Future;
use std::path::Path;

use crate::services::task_repository::TaskRepository;
use crate::services::torrent_storage;
use crate::state::models::{Task, TaskStatus, TorrentFile, TorrentMetadata};
use chrono::Utc;
use serde_json::Value as JsonValue;

#[derive(Debug)]
pub enum EnginePollingError {
    Database(sqlx::Error),
    Io(String),
    Serde(String),
}

impl From<sqlx::Error> for EnginePollingError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value)
    }
}

impl From<torrent_storage::TorrentStorageError> for EnginePollingError {
    fn from(value: torrent_storage::TorrentStorageError) -> Self {
        match value {
            torrent_storage::TorrentStorageError::Io(message) => Self::Io(message),
            torrent_storage::TorrentStorageError::Serde(message) => Self::Serde(message),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MagnetMetadataResolved {
    pub task_id: String,
    pub paused_gid: String,
    pub metadata: TorrentMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionReconciliationResult {
    pub readded_missing_tasks: usize,
    pub imported_orphan_tasks: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveTaskStatus {
    pub gid: String,
    pub status: String,
    pub total_length: i64,
    pub completed_length: i64,
    pub download_speed: i64,
    pub upload_speed: i64,
    pub upload_length: i64,
    pub error_message: Option<String>,
}

pub struct EnginePollingService {
    repository: TaskRepository,
}

impl EnginePollingService {
    pub fn new(repository: TaskRepository) -> Self {
        Self { repository }
    }

    pub async fn import_external_tasks(&self, tasks: &[Task]) -> Result<usize, EnginePollingError> {
        let existing = self.repository.list().await?;
        let mut known_gids = HashSet::new();
        for task in existing {
            if let Some(gid) = task.aria2_gid {
                known_gids.insert(gid);
            }
        }

        let mut inserted = 0;
        for task in tasks {
            if let Some(gid) = &task.aria2_gid {
                if known_gids.contains(gid) {
                    continue;
                }
            }

            let mut imported = task.clone();
            imported.orphan_imported = true;
            self.repository.create(&imported).await?;
            inserted += 1;
        }

        Ok(inserted)
    }

    pub async fn reconcile_session_restore<F, Fut>(
        &self,
        live_tasks: &[Task],
        mut readd_missing: F,
    ) -> Result<SessionReconciliationResult, EnginePollingError>
    where
        F: FnMut(Task) -> Fut,
        Fut: Future<Output = Result<String, EnginePollingError>>,
    {
        let existing = self.repository.list().await?;
        let live_gids = live_tasks
            .iter()
            .filter_map(|task| task.aria2_gid.clone())
            .collect::<HashSet<_>>();

        let mut readded_missing_tasks = 0;
        for task in existing.iter().filter(|task| is_pending(task.status)) {
            if task
                .aria2_gid
                .as_ref()
                .is_some_and(|gid| live_gids.contains(gid))
            {
                continue;
            }

            let new_gid = readd_missing(task.clone()).await?;
            let mut updated = task.clone();
            updated.aria2_gid = Some(new_gid);
            updated.updated_at = Utc::now().to_rfc3339();
            self.repository.update(&updated).await?;
            readded_missing_tasks += 1;
        }

        let imported_orphan_tasks = self.import_external_tasks(live_tasks).await?;

        Ok(SessionReconciliationResult {
            readded_missing_tasks,
            imported_orphan_tasks,
        })
    }

    pub async fn apply_live_statuses(
        &self,
        statuses: &[LiveTaskStatus],
    ) -> Result<usize, EnginePollingError> {
        let existing = self.repository.list().await?;
        let mut updated_count = 0;
        let now = Utc::now().to_rfc3339();

        for status in statuses {
            let Some(mut task) = existing
                .iter()
                .find(|task| task.aria2_gid.as_deref() == Some(status.gid.as_str()))
                .cloned()
            else {
                continue;
            };

            let next_status = map_live_status(&status.status, task.status);
            let next_progress = progress_percent(status.completed_length, status.total_length);
            let completed_at = match next_status {
                TaskStatus::Complete | TaskStatus::Stopped | TaskStatus::Error => {
                    task.completed_at.clone().or_else(|| Some(now.clone()))
                }
                _ => None,
            };

            task.status = next_status;
            task.progress_percent = next_progress;
            task.downloaded_bytes = status.completed_length;
            task.total_bytes = status.total_length;
            task.download_speed_bps = status.download_speed;
            task.upload_speed_bps = status.upload_speed;
            task.uploaded_bytes = status.upload_length;
            task.error_message = status.error_message.clone();
            task.completed_at = completed_at;
            task.updated_at = now.clone();

            self.repository.update(&task).await?;
            updated_count += 1;
        }

        Ok(updated_count)
    }

    pub async fn resolve_magnet_metadata(
        &self,
        metadata_gid: &str,
        paused_status: &JsonValue,
        files: &[JsonValue],
        metadata_dir: &Path,
    ) -> Result<Option<MagnetMetadataResolved>, EnginePollingError> {
        let Some(metadata) = parse_resolved_metadata(paused_status, files) else {
            return Ok(None);
        };

        let Some(mut task) = self.find_task_by_gid(metadata_gid).await? else {
            return Ok(None);
        };

        let paused_gid = paused_status
            .get("gid")
            .and_then(JsonValue::as_str)
            .unwrap_or(metadata_gid)
            .to_string();

        torrent_storage::save_metadata_to_dir(metadata_dir, &metadata)?;

        task.aria2_gid = Some(paused_gid.clone());
        task.status = TaskStatus::Paused;
        task.display_name = metadata.name.clone();
        task.total_bytes = metadata.total_bytes;
        task.torrent_info_hash = Some(metadata.info_hash.clone());
        task.updated_at = Utc::now().to_rfc3339();

        self.repository.update(&task).await?;

        Ok(Some(MagnetMetadataResolved {
            task_id: task.id,
            paused_gid,
            metadata,
        }))
    }

    async fn find_task_by_gid(&self, gid: &str) -> Result<Option<Task>, EnginePollingError> {
        let tasks = self.repository.list().await?;
        Ok(tasks
            .into_iter()
            .find(|task| task.aria2_gid.as_deref() == Some(gid)))
    }
}

fn is_pending(status: TaskStatus) -> bool {
    matches!(
        status,
        TaskStatus::Active | TaskStatus::Waiting | TaskStatus::Paused
    )
}

fn map_live_status(status: &str, fallback: TaskStatus) -> TaskStatus {
    match status {
        "active" => TaskStatus::Active,
        "waiting" => TaskStatus::Waiting,
        "paused" => TaskStatus::Paused,
        "complete" => TaskStatus::Complete,
        "error" => TaskStatus::Error,
        "removed" => TaskStatus::Stopped,
        _ => fallback,
    }
}

fn progress_percent(completed_length: i64, total_length: i64) -> f64 {
    if total_length <= 0 {
        return 0.0;
    }

    ((completed_length.max(0) as f64 / total_length as f64) * 100.0).clamp(0.0, 100.0)
}

fn parse_resolved_metadata(status: &JsonValue, files: &[JsonValue]) -> Option<TorrentMetadata> {
    let bittorrent = status.get("bittorrent")?;
    let info = bittorrent.get("info")?.as_object()?;
    if info.is_empty() {
        return None;
    }

    let info_hash = status
        .get("infoHash")
        .and_then(JsonValue::as_str)
        .filter(|value| !value.is_empty())?
        .to_string();
    let total_bytes = parse_i64_string(status.get("totalLength"));
    let peers = parse_i64_string(status.get("connections"));
    let seeders = parse_i64_string(status.get("numSeeders"));
    let name = info
        .get("name")
        .and_then(JsonValue::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("Torrent")
        .to_string();
    let trackers = parse_announce_list(bittorrent.get("announceList"));

    Some(TorrentMetadata {
        info_hash,
        name,
        total_bytes,
        files: files.iter().map(parse_torrent_file).collect(),
        trackers,
        peers,
        seeders,
    })
}

fn parse_torrent_file(file: &JsonValue) -> TorrentFile {
    TorrentFile {
        index: file
            .get("index")
            .and_then(JsonValue::as_str)
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0),
        path: file
            .get("path")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string(),
        bytes: parse_i64_string(file.get("length")),
        completed_bytes: parse_i64_string(file.get("completedLength")),
        selected: file
            .get("selected")
            .and_then(JsonValue::as_str)
            .map(|value| value == "true")
            .unwrap_or(false),
    }
}

fn parse_i64_string(value: Option<&JsonValue>) -> i64 {
    value
        .and_then(JsonValue::as_str)
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
}

fn parse_announce_list(value: Option<&JsonValue>) -> Vec<String> {
    let Some(entries) = value.and_then(JsonValue::as_array) else {
        return Vec::new();
    };

    entries
        .iter()
        .filter_map(JsonValue::as_array)
        .flat_map(|tier| tier.iter())
        .filter_map(JsonValue::as_str)
        .map(str::to_string)
        .collect()
}
