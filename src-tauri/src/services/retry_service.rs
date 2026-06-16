use std::fs::OpenOptions;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use serde_json::Value as JsonValue;

use crate::engine::aria2_client::build_options_map;
use crate::engine::engine_manager::check_disk_space;
use crate::services::task_repository::TaskRepository;
use crate::services::torrent_settings;
use crate::state::models::{Task, TaskStatus, TorrentMetadata};

#[derive(Debug, Clone)]
pub struct RetrySettings {
    pub seed_ratio_target: f64,
    pub metadata_dir: Option<PathBuf>,
}

impl Default for RetrySettings {
    fn default() -> Self {
        Self {
            seed_ratio_target: 1.0,
            metadata_dir: None,
        }
    }
}

#[derive(Debug)]
pub enum RetryServiceError {
    NotFound,
    InvalidStatus,
    InvalidSource(String),
    Disk(String),
    Io(String),
    Rpc(String),
    Selection(String),
}

impl std::fmt::Display for RetryServiceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RetryServiceError::NotFound => write!(formatter, "task not found"),
            RetryServiceError::InvalidStatus => {
                write!(formatter, "only errored tasks can be retried")
            }
            RetryServiceError::InvalidSource(message)
            | RetryServiceError::Disk(message)
            | RetryServiceError::Io(message)
            | RetryServiceError::Rpc(message)
            | RetryServiceError::Selection(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for RetryServiceError {}

impl From<std::io::Error> for RetryServiceError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

pub type RetryFuture<'a> = Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>>;

pub trait RetryRpcClient: Send + Sync {
    fn add_uri(&self, uri: String, options: JsonValue) -> RetryFuture<'_>;
    fn add_torrent(&self, torrent: String, options: JsonValue) -> RetryFuture<'_>;
}

pub struct RetryService<C> {
    repository: TaskRepository,
    client: C,
    settings: RetrySettings,
}

impl<C> RetryService<C>
where
    C: RetryRpcClient,
{
    pub fn new(repository: TaskRepository, client: C, settings: RetrySettings) -> Self {
        Self {
            repository,
            client,
            settings,
        }
    }

    pub async fn retry_task(&self, task_id: &str) -> Result<Task, RetryServiceError> {
        let mut task = self
            .repository
            .get(task_id)
            .await
            .map_err(|error| RetryServiceError::Io(error.to_string()))?
            .ok_or(RetryServiceError::NotFound)?;

        if task.status != TaskStatus::Error {
            return Err(RetryServiceError::InvalidStatus);
        }

        let retry_request = match self.prepare_retry_request(&task) {
            Ok(request) => request,
            Err(error) => {
                self.record_failure(&mut task, &error).await?;
                return Err(error);
            }
        };

        let new_gid = match retry_request {
            RetryRequest::Uri {
                source_uri,
                options,
            } => self
                .client
                .add_uri(source_uri, options)
                .await
                .map_err(RetryServiceError::Rpc),
            RetryRequest::Torrent { encoded, options } => self
                .client
                .add_torrent(encoded, options)
                .await
                .map_err(RetryServiceError::Rpc),
        };

        let new_gid = match new_gid {
            Ok(gid) => gid,
            Err(error) => {
                self.record_failure(&mut task, &error).await?;
                return Err(error);
            }
        };

        task.aria2_gid = Some(new_gid);
        task.status = TaskStatus::Waiting;
        task.error_message = None;
        task.completed_at = None;
        task.download_speed_bps = 0;
        task.upload_speed_bps = 0;
        task.updated_at = now_rfc3339();

        self.repository
            .update(&task)
            .await
            .map_err(|error| RetryServiceError::Io(error.to_string()))?;

        Ok(task)
    }

    fn prepare_retry_request(&self, task: &Task) -> Result<RetryRequest, RetryServiceError> {
        let destination_dir = destination_dir(task);
        ensure_destination_dir(&destination_dir)?;

        if let Some(required_bytes) = self.required_bytes(task)? {
            check_disk_space(&destination_dir, required_bytes)
                .map_err(|error| RetryServiceError::Disk(error.user_message()))?;
        }

        if task.is_torrent {
            return self.prepare_torrent_retry(task, &destination_dir);
        }

        Ok(RetryRequest::Uri {
            source_uri: task.source_uri.clone(),
            options: build_options_map(vec![
                (
                    "dir",
                    JsonValue::String(destination_dir.to_string_lossy().to_string()),
                ),
                ("out", JsonValue::String(task.display_name.clone())),
            ]),
        })
    }

    fn prepare_torrent_retry(
        &self,
        task: &Task,
        destination_dir: &Path,
    ) -> Result<RetryRequest, RetryServiceError> {
        let selected_indices = self.selected_indices(task)?;
        let selected_files = torrent_settings::format_selected_files(&selected_indices);
        let options = build_options_map(torrent_settings::build_torrent_options(
            &destination_dir.to_string_lossy(),
            &selected_files,
            self.settings.seed_ratio_target,
        ));

        if is_magnet_uri(&task.source_uri) {
            return Ok(RetryRequest::Uri {
                source_uri: task.source_uri.clone(),
                options,
            });
        }

        let source_path = PathBuf::from(&task.source_uri);
        if !source_path.exists() {
            return Err(RetryServiceError::InvalidSource(
                "retry source torrent file is missing".to_string(),
            ));
        }

        self.verify_torrent_metadata(task)?;
        let bytes = std::fs::read(source_path)?;
        Ok(RetryRequest::Torrent {
            encoded: STANDARD.encode(bytes),
            options,
        })
    }

    fn selected_indices(&self, task: &Task) -> Result<Vec<u32>, RetryServiceError> {
        let Some(selected_files) = task.selected_files.as_ref() else {
            return Ok(Vec::new());
        };

        if selected_files.is_empty() {
            return Ok(Vec::new());
        }

        let metadata = self.load_metadata(task)?;
        let mut indices = Vec::with_capacity(selected_files.len());

        for selected_file in selected_files {
            let file = metadata
                .files
                .iter()
                .find(|file| file.path == *selected_file)
                .ok_or_else(|| {
                    RetryServiceError::Selection(
                        "saved file selection can no longer be applied".to_string(),
                    )
                })?;
            indices.push(file.index);
        }

        Ok(indices)
    }

    fn required_bytes(&self, task: &Task) -> Result<Option<u64>, RetryServiceError> {
        let total_bytes = if task.is_torrent {
            self.selected_payload_bytes(task)?
                .unwrap_or_else(|| task.total_bytes.max(0) as u64)
        } else {
            task.total_bytes.max(0) as u64
        };

        if total_bytes == 0 {
            return Ok(None);
        }

        let downloaded_bytes = task.downloaded_bytes.max(0) as u64;
        Ok(Some(total_bytes.saturating_sub(downloaded_bytes)))
    }

    fn selected_payload_bytes(&self, task: &Task) -> Result<Option<u64>, RetryServiceError> {
        let Some(selected_files) = task.selected_files.as_ref() else {
            return Ok(None);
        };

        if selected_files.is_empty() {
            return Ok(None);
        }

        let metadata = self.load_metadata(task)?;
        let mut total = 0_u64;

        for selected_file in selected_files {
            let file = metadata
                .files
                .iter()
                .find(|file| file.path == *selected_file)
                .ok_or_else(|| {
                    RetryServiceError::Selection(
                        "saved file selection can no longer be applied".to_string(),
                    )
                })?;
            total = total.saturating_add(file.bytes.max(0) as u64);
        }

        Ok(Some(total))
    }

    fn verify_torrent_metadata(&self, task: &Task) -> Result<(), RetryServiceError> {
        let Some(expected_hash) = task.torrent_info_hash.as_ref() else {
            return Err(RetryServiceError::InvalidSource(
                "stored torrent info hash is missing".to_string(),
            ));
        };

        let metadata = self.load_metadata(task)?;
        if metadata.info_hash != *expected_hash {
            return Err(RetryServiceError::InvalidSource(
                "stored torrent metadata no longer matches the task".to_string(),
            ));
        }

        Ok(())
    }

    fn load_metadata(&self, task: &Task) -> Result<TorrentMetadata, RetryServiceError> {
        let metadata_dir = self.settings.metadata_dir.as_ref().ok_or_else(|| {
            RetryServiceError::InvalidSource("stored torrent metadata is missing".to_string())
        })?;
        let info_hash = task.torrent_info_hash.as_ref().ok_or_else(|| {
            RetryServiceError::InvalidSource("stored torrent metadata is missing".to_string())
        })?;
        let metadata_path = metadata_dir.join(format!("{info_hash}.json"));

        if !metadata_path.exists() {
            return Err(RetryServiceError::InvalidSource(
                "stored torrent metadata is missing".to_string(),
            ));
        }

        let contents = std::fs::read_to_string(metadata_path)?;
        serde_json::from_str(&contents)
            .map_err(|error| RetryServiceError::InvalidSource(error.to_string()))
    }

    async fn record_failure(
        &self,
        task: &mut Task,
        error: &RetryServiceError,
    ) -> Result<(), RetryServiceError> {
        task.error_message = Some(error.to_string());
        task.updated_at = now_rfc3339();
        self.repository
            .update(task)
            .await
            .map_err(|db_error| RetryServiceError::Io(db_error.to_string()))
    }
}

enum RetryRequest {
    Uri {
        source_uri: String,
        options: JsonValue,
    },
    Torrent {
        encoded: String,
        options: JsonValue,
    },
}

fn destination_dir(task: &Task) -> PathBuf {
    Path::new(&task.destination_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(&task.destination_path))
}

fn ensure_destination_dir(path: &Path) -> Result<(), RetryServiceError> {
    std::fs::create_dir_all(path)?;

    let probe = path.join(format!(".ferro-write-test-{}", uuid::Uuid::new_v4()));
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&probe)?;
    std::fs::remove_file(&probe)?;

    Ok(())
}

fn is_magnet_uri(source_uri: &str) -> bool {
    source_uri
        .trim_start()
        .to_ascii_lowercase()
        .starts_with("magnet:")
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
