use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::commands::AppState;
use crate::engine::aria2_client::Aria2Client;
use crate::engine::engine_manager::{check_disk_space, MIN_DISK_SPACE_BYTES};
use crate::services::download_paths::{
    collision_message, normalize_destination_dir,
    prepare_single_file_destination_with_reserved_paths, CollisionResolution,
    COLLISION_NOTICE_EVENT,
};
use crate::services::engine_polling::{EnginePollingService, LiveTaskStatus};
use crate::services::retry_service::{RetryFuture, RetryRpcClient, RetryService, RetrySettings};
use crate::services::settings_store::{default_settings, AppSettingsStore};
use crate::services::speed_aggregator::{update_tray_tooltip_from_tasks, TauriTrayTooltipUpdater};
use crate::services::task_repository::TaskRepository;
use crate::state::models::{FileCollisionBehavior, Task, TaskStatus};

pub type QueueReorderFuture<'a> = Pin<Box<dyn Future<Output = Result<i64, String>> + Send + 'a>>;
pub type QueueGlobalFuture<'a> = Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>>;

pub trait QueueReorderRpcClient {
    fn change_position(&self, gid: String, pos: i64, how: String) -> QueueReorderFuture<'_>;
}

pub trait QueueGlobalRpcClient {
    fn force_pause_all(&self) -> QueueGlobalFuture<'_>;
    fn unpause_all(&self) -> QueueGlobalFuture<'_>;
}

#[tauri::command]
pub fn check_download_space(download_dir: String) -> Result<(), String> {
    check_disk_space(&PathBuf::from(download_dir), MIN_DISK_SPACE_BYTES)
        .map_err(|error| error.user_message())
}

fn is_e2e_mode() -> bool {
    std::env::var("FERRO_E2E").is_ok() || std::env::var("FERRO_DB_IN_MEMORY").is_ok()
}

#[tauri::command]
pub async fn list_tasks(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let repo = TaskRepository::new(state.pool.clone());
    let mut tasks = repo.list().await.map_err(|error| error.to_string())?;
    let mut waiting_order: Vec<String> = Vec::new();
    if has_refreshable_live_tasks(&tasks) {
        match refresh_task_statuses_from_engine(&state).await {
            Ok(order) => waiting_order = order,
            Err(error) => {
                log::warn!("Unable to refresh task status from aria2: {error}");
            }
        }
        tasks = repo.list().await.map_err(|error| error.to_string())?;
    }
    let tasks = order_waiting_tasks(tasks, &waiting_order);
    let updater = TauriTrayTooltipUpdater::new(app);
    if let Err(error) = update_tray_tooltip_from_tasks(&updater, &tasks) {
        log::debug!("Unable to update tray tooltip: {error}");
    }
    Ok(tasks)
}

fn has_refreshable_live_tasks(tasks: &[Task]) -> bool {
    tasks.iter().any(|task| {
        task.aria2_gid.is_some()
            && matches!(
                task.status,
                TaskStatus::Active | TaskStatus::Waiting | TaskStatus::Paused
            )
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Aria2TaskStatus {
    gid: String,
    status: String,
    total_length: Option<String>,
    completed_length: Option<String>,
    download_speed: Option<String>,
    upload_speed: Option<String>,
    upload_length: Option<String>,
    error_message: Option<String>,
}

impl From<Aria2TaskStatus> for LiveTaskStatus {
    fn from(value: Aria2TaskStatus) -> Self {
        Self {
            gid: value.gid,
            status: value.status,
            total_length: parse_aria2_i64(value.total_length.as_deref()),
            completed_length: parse_aria2_i64(value.completed_length.as_deref()),
            download_speed: parse_aria2_i64(value.download_speed.as_deref()),
            upload_speed: parse_aria2_i64(value.upload_speed.as_deref()),
            upload_length: parse_aria2_i64(value.upload_length.as_deref()),
            error_message: value.error_message,
        }
    }
}

async fn refresh_task_statuses_from_engine(state: &AppState) -> Result<Vec<String>, String> {
    if is_e2e_mode() {
        return Ok(Vec::new());
    }

    let (rpc_host, rpc_port, rpc_secret, is_running) = engine_rpc_snapshot(state).await;
    if !is_running || rpc_port == 0 {
        return Ok(Vec::new());
    }

    let client = Aria2Client::new(&rpc_host, rpc_port, rpc_secret);
    let (statuses, waiting_gids) = fetch_live_task_statuses(&client).await?;
    if statuses.is_empty() {
        return Ok(waiting_gids);
    }

    EnginePollingService::new(TaskRepository::new(state.pool.clone()))
        .apply_live_statuses(&statuses)
        .await
        .map_err(|error| format!("{error:?}"))?;
    Ok(waiting_gids)
}

async fn fetch_live_task_statuses(
    client: &Aria2Client,
) -> Result<(Vec<LiveTaskStatus>, Vec<String>), String> {
    let fields = json!([
        "gid",
        "status",
        "totalLength",
        "completedLength",
        "downloadSpeed",
        "uploadSpeed",
        "uploadLength",
        "errorMessage"
    ]);
    let mut statuses = Vec::new();

    let active = client
        .call::<Vec<Aria2TaskStatus>>("aria2.tellActive", vec![fields.clone()])
        .await
        .map_err(|error| error.to_command_payload())?;
    statuses.extend(active.into_iter().map(LiveTaskStatus::from));

    let waiting = client
        .call::<Vec<Aria2TaskStatus>>(
            "aria2.tellWaiting",
            vec![json!(0), json!(1000), fields.clone()],
        )
        .await
        .map_err(|error| error.to_command_payload())?;
    // aria2.tellWaiting returns waiting downloads in queue order; preserve that order
    // so the UI can render and drag-reorder the queue against real engine positions.
    let waiting_gids: Vec<String> = waiting.iter().map(|status| status.gid.clone()).collect();
    statuses.extend(waiting.into_iter().map(LiveTaskStatus::from));

    let stopped = client
        .call::<Vec<Aria2TaskStatus>>("aria2.tellStopped", vec![json!(0), json!(1000), fields])
        .await
        .map_err(|error| error.to_command_payload())?;
    statuses.extend(stopped.into_iter().map(LiveTaskStatus::from));

    Ok((statuses, waiting_gids))
}

async fn engine_rpc_snapshot(state: &AppState) -> (String, u16, Option<String>, bool) {
    let manager = state.engine.0.lock().await;
    let status = manager.status();
    let secret = manager
        .rpc_secret()
        .filter(|value| !value.trim().is_empty());
    (
        status.rpc_host,
        status.rpc_port,
        secret,
        status.process_state == crate::state::models::EngineProcessState::Running,
    )
}

fn parse_aria2_i64(value: Option<&str>) -> i64 {
    value
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
}

#[tauri::command]
pub async fn add_task(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    destination: String,
) -> Result<(), String> {
    let trimmed_url = url.trim().to_string();
    if trimmed_url.is_empty() {
        return Err("download URL is required".to_string());
    }

    let destination_dir = resolve_destination_dir(&app, &destination)?;

    let display_name = extract_display_name(&trimmed_url);
    let settings = AppSettingsStore::new(app.clone())
        .load()
        .unwrap_or_else(|_| default_settings());
    let repo = TaskRepository::new(state.pool.clone());
    let reserved_destination_paths = active_task_destination_paths(&repo)
        .await
        .map_err(|error| error.to_string())?;
    let prepared_destination = match prepare_direct_download_destination_with_reserved_paths(
        &destination_dir,
        &display_name,
        settings.file_collision_behavior,
        &reserved_destination_paths,
    )? {
        Ok(destination) => destination,
        Err(notice) => {
            emit_collision_notice(&app, &notice)?;
            return Err(collision_message(&notice)
                .unwrap_or("download collision")
                .to_string());
        }
    };
    let gid = if is_e2e_mode() {
        "e2e-http".to_string()
    } else {
        let (rpc_host, rpc_port, rpc_secret) = engine_rpc_config(&state).await;
        let client = Aria2Client::new(&rpc_host, rpc_port, rpc_secret);
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.addUri)
        client
            .call(
                "aria2.addUri",
                vec![
                    json!([trimmed_url.clone()]),
                    json!({
                        "dir": destination_dir,
                        "out": prepared_destination.output_name,
                    }),
                ],
            )
            .await
            .map_err(|error| error.to_command_payload())?
    };

    let task = build_pending_add_task_record(
        gid,
        trimmed_url,
        display_name,
        prepared_destination.destination_path,
        now_rfc3339(),
    );

    repo.create(&task)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn build_pending_add_task_record(
    gid: String,
    source_uri: String,
    display_name: String,
    destination_path: String,
    timestamp: String,
) -> Task {
    Task {
        id: Uuid::new_v4().to_string(),
        aria2_gid: Some(gid),
        source_uri,
        display_name,
        destination_path,
        status: TaskStatus::Waiting,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[tauri::command]
pub async fn pause_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let (repo, mut task) = load_task(&state, &task_id).await?;
    let client = build_client(&state).await;

    let gid = task
        .aria2_gid
        .clone()
        .ok_or_else(|| "task has no aria2 gid".to_string())?;
    // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.forcePause)
    client
        .call::<String>("aria2.forcePause", vec![json!(gid)])
        .await
        .map_err(|error| error.to_command_payload())?;

    update_task_status(&repo, &mut task, TaskStatus::Paused).await
}

#[tauri::command]
pub async fn resume_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let (repo, mut task) = load_task(&state, &task_id).await?;
    let client = build_client(&state).await;

    let gid = task
        .aria2_gid
        .clone()
        .ok_or_else(|| "task has no aria2 gid".to_string())?;
    // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.unpause)
    client
        .call::<String>("aria2.unpause", vec![json!(gid)])
        .await
        .map_err(|error| error.to_command_payload())?;

    update_task_status(&repo, &mut task, TaskStatus::Waiting).await
}

#[tauri::command]
pub async fn reorder_task_to(
    state: State<'_, AppState>,
    task_id: String,
    position: i64,
) -> Result<i64, String> {
    let client = build_client(&state).await;
    reorder_task_to_with_client(client, &state, task_id, position).await
}

pub async fn reorder_task_to_with_client<C>(
    client: C,
    state: &AppState,
    task_id: String,
    position: i64,
) -> Result<i64, String>
where
    C: QueueReorderRpcClient,
{
    let (_, task) = load_task(state, &task_id).await?;
    if task.status != TaskStatus::Waiting {
        return Err("only waiting tasks can be reordered".to_string());
    }

    let gid = task
        .aria2_gid
        .ok_or_else(|| "task has no aria2 gid".to_string())?;
    let position = position.max(0);
    // Ref: https://aria2.github.io/manual/en/html/aria2c.html#aria2.changePosition
    // POS_SET sets the absolute 0-based position within the waiting queue.
    client
        .change_position(gid, position, "POS_SET".to_string())
        .await
}

#[tauri::command]
pub async fn pause_all_tasks(state: State<'_, AppState>) -> Result<(), String> {
    let client = build_client(&state).await;
    pause_all_tasks_with_client(client).await
}

pub async fn pause_all_tasks_with_client<C>(client: C) -> Result<(), String>
where
    C: QueueGlobalRpcClient,
{
    client.force_pause_all().await
}

#[tauri::command]
pub async fn resume_all_tasks(state: State<'_, AppState>) -> Result<(), String> {
    let client = build_client(&state).await;
    resume_all_tasks_with_client(client).await
}

pub async fn resume_all_tasks_with_client<C>(client: C) -> Result<(), String>
where
    C: QueueGlobalRpcClient,
{
    client.unpause_all().await
}

#[tauri::command]
pub async fn cancel_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let (repo, mut task) = load_task(&state, &task_id).await?;
    let client = build_client(&state).await;

    if let Some(gid) = task.aria2_gid.clone() {
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.forceRemove)
        client
            .call::<String>("aria2.forceRemove", vec![json!(gid)])
            .await
            .map_err(|error| error.to_command_payload())?;
    }

    task.aria2_gid = None;
    update_task_status(&repo, &mut task, TaskStatus::Stopped).await
}

#[tauri::command]
pub async fn remove_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    remove_task_with_state(&state, task_id).await
}

pub async fn remove_task_with_state(state: &AppState, task_id: String) -> Result<(), String> {
    let repo = TaskRepository::new(state.pool.clone());
    let task = repo
        .get(&task_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "task not found".to_string())?;

    if matches!(
        task.status,
        TaskStatus::Active | TaskStatus::Waiting | TaskStatus::Paused
    ) {
        return Err("active tasks must be cancelled before deletion".to_string());
    }

    if let Some(gid) = task.aria2_gid {
        let client = build_client(state).await;
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.forceRemove)
        client
            .call::<String>("aria2.forceRemove", vec![json!(gid)])
            .await
            .map_err(|error| error.to_command_payload())?;
    }

    repo.delete(&task_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_task_with_files(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    delete_task_with_files_with_state(&state, task_id).await
}

pub async fn delete_task_with_files_with_state(
    state: &AppState,
    task_id: String,
) -> Result<(), String> {
    let repo = TaskRepository::new(state.pool.clone());
    let task = repo
        .get(&task_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "task not found".to_string())?;

    if matches!(
        task.status,
        TaskStatus::Active | TaskStatus::Waiting | TaskStatus::Paused
    ) {
        return Err("active tasks must be cancelled before deletion".to_string());
    }

    let payload_path = Path::new(&task.destination_path);
    if payload_path.exists() {
        trash::delete(payload_path).map_err(|error| error.to_string())?;
    }

    repo.delete(&task_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn retry_task(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Task, String> {
    retry_task_with_app(app, &state, task_id).await
}

pub async fn retry_task_with_app<R>(
    app: AppHandle<R>,
    state: &AppState,
    task_id: String,
) -> Result<Task, String>
where
    R: tauri::Runtime,
{
    let settings = AppSettingsStore::new(app.clone())
        .load()
        .unwrap_or_else(|_| default_settings());

    let client = if is_e2e_mode() {
        CommandRetryClient::E2e(E2eRetryClient)
    } else {
        CommandRetryClient::Real(Aria2RetryClient {
            client: build_client(state).await,
        })
    };

    retry_task_with_settings(
        client,
        state,
        task_id,
        RetrySettings {
            seed_ratio_target: settings.seed_ratio_target,
            metadata_dir: app
                .path()
                .resolve("torrent-metadata", BaseDirectory::AppData)
                .ok(),
        },
    )
    .await
}

pub async fn retry_task_with_settings<C>(
    client: C,
    state: &AppState,
    task_id: String,
    settings: RetrySettings,
) -> Result<Task, String>
where
    C: RetryRpcClient,
{
    let service = RetryService::new(TaskRepository::new(state.pool.clone()), client, settings);

    service
        .retry_task(&task_id)
        .await
        .map_err(|error| error.to_string())
}

async fn engine_rpc_config(state: &AppState) -> (String, u16, Option<String>) {
    let manager = state.engine.0.lock().await;
    let status = manager.status();
    let secret = manager
        .rpc_secret()
        .filter(|value| !value.trim().is_empty());
    (status.rpc_host, status.rpc_port, secret)
}

async fn build_client(state: &AppState) -> Aria2Client {
    let (host, port, secret) = engine_rpc_config(state).await;
    Aria2Client::new(&host, port, secret)
}

/// Reorders the `Waiting` tasks within `tasks` to match aria2's live queue order
/// (`waiting_order`: gids in queue order). Tasks of other statuses keep their slots,
/// and waiting tasks whose gid is absent from `waiting_order` retain their relative
/// order at the end. The frontend derives `queue_position` from this order, so a
/// drag-to-reorder move survives the next poll.
pub fn order_waiting_tasks(mut tasks: Vec<Task>, waiting_order: &[String]) -> Vec<Task> {
    if waiting_order.is_empty() {
        return tasks;
    }

    let rank: HashMap<&str, usize> = waiting_order
        .iter()
        .enumerate()
        .map(|(index, gid)| (gid.as_str(), index))
        .collect();

    let waiting_slots: Vec<usize> = tasks
        .iter()
        .enumerate()
        .filter(|(_, task)| task.status == TaskStatus::Waiting)
        .map(|(index, _)| index)
        .collect();
    if waiting_slots.len() < 2 {
        return tasks;
    }

    let mut waiting_tasks: Vec<Task> = waiting_slots
        .iter()
        .map(|&slot| tasks[slot].clone())
        .collect();
    waiting_tasks.sort_by_key(|task| {
        task.aria2_gid
            .as_deref()
            .and_then(|gid| rank.get(gid).copied())
            .unwrap_or(usize::MAX)
    });

    for (slot, task) in waiting_slots.iter().zip(waiting_tasks) {
        tasks[*slot] = task;
    }
    tasks
}

fn resolve_destination_dir(app: &AppHandle, destination: &str) -> Result<String, String> {
    let fallback = AppSettingsStore::new(app.clone())
        .load()
        .ok()
        .map(|settings| settings.download_directory)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            app.path()
                .resolve("", BaseDirectory::Download)
                .ok()
                .map(|path| path.to_string_lossy().to_string())
        })
        .unwrap_or_default();

    normalize_destination_dir(destination, &fallback)
}

fn extract_display_name(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return "download".to_string();
    }

    let segment = trimmed.split('/').next_back().unwrap_or("download");
    let without_query = segment
        .split('?')
        .next()
        .unwrap_or(segment)
        .split('#')
        .next()
        .unwrap_or(segment);
    let cleaned = without_query.trim();
    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned.to_string()
    }
}

#[cfg(test)]
fn build_destination_path(destination_dir: &str, display_name: &str) -> Result<String, String> {
    Ok(prepare_direct_download_destination_with_reserved_paths(
        destination_dir,
        display_name,
        FileCollisionBehavior::Rename,
        &[],
    )?
    .map_err(|notice| {
        collision_message(&notice)
            .unwrap_or("download collision")
            .to_string()
    })?
    .destination_path)
}

#[derive(Debug, PartialEq, Eq)]
pub struct PreparedDirectDownloadDestination {
    pub destination_path: String,
    pub output_name: String,
}

pub fn prepare_direct_download_destination_with_reserved_paths(
    destination_dir: &str,
    display_name: &str,
    behavior: FileCollisionBehavior,
    reserved_paths: &[PathBuf],
) -> Result<Result<PreparedDirectDownloadDestination, CollisionResolution>, String> {
    let dir = Path::new(destination_dir);
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let candidate = dir.join(display_name);
    let resolved =
        prepare_single_file_destination_with_reserved_paths(&candidate, behavior, reserved_paths)?;

    match resolved {
        CollisionResolution::UsePath(path) => {
            let output_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(display_name)
                .to_string();

            Ok(Ok(PreparedDirectDownloadDestination {
                destination_path: path.to_string_lossy().to_string(),
                output_name,
            }))
        }
        blocked @ CollisionResolution::Blocked { .. } => Ok(Err(blocked)),
    }
}

async fn active_task_destination_paths(repo: &TaskRepository) -> Result<Vec<PathBuf>, sqlx::Error> {
    let tasks = repo.list().await?;
    Ok(tasks
        .into_iter()
        .filter(|task| {
            matches!(
                task.status,
                TaskStatus::Active | TaskStatus::Waiting | TaskStatus::Paused
            )
        })
        .map(|task| PathBuf::from(task.destination_path))
        .collect())
}

fn emit_collision_notice(app: &AppHandle, notice: &CollisionResolution) -> Result<(), String> {
    app.emit(COLLISION_NOTICE_EVENT, notice)
        .map_err(|error| error.to_string())
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

async fn load_task(state: &AppState, task_id: &str) -> Result<(TaskRepository, Task), String> {
    let repo = TaskRepository::new(state.pool.clone());
    let task = repo
        .get(task_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "task not found".to_string())?;
    Ok((repo, task))
}

async fn update_task_status(
    repo: &TaskRepository,
    task: &mut Task,
    status: TaskStatus,
) -> Result<(), String> {
    task.status = status;
    let now = now_rfc3339();
    task.updated_at = now.clone();
    task.completed_at = match task.status {
        TaskStatus::Stopped | TaskStatus::Complete | TaskStatus::Error => Some(now),
        _ => None,
    };
    repo.update(task).await.map_err(|error| error.to_string())
}

struct Aria2RetryClient {
    client: Aria2Client,
}

impl RetryRpcClient for Aria2RetryClient {
    fn add_uri(&self, source_uri: String, options: serde_json::Value) -> RetryFuture<'_> {
        Box::pin(async move {
            self.client
                .call("aria2.addUri", vec![json!([source_uri]), options])
                .await
                .map_err(|error| error.to_command_payload())
        })
    }

    fn add_torrent(&self, encoded: String, options: serde_json::Value) -> RetryFuture<'_> {
        Box::pin(async move {
            self.client
                .call("aria2.addTorrent", vec![json!(encoded), json!([]), options])
                .await
                .map_err(|error| error.to_command_payload())
        })
    }
}

impl QueueReorderRpcClient for Aria2Client {
    fn change_position(&self, gid: String, pos: i64, how: String) -> QueueReorderFuture<'_> {
        Box::pin(async move {
            // Ref: https://aria2.github.io/manual/en/html/aria2c.html#aria2-changeposition
            self.call::<i64>(
                "aria2.changePosition",
                vec![json!(gid), json!(pos), json!(how)],
            )
            .await
            .map_err(|error| error.to_command_payload())
        })
    }
}

impl QueueGlobalRpcClient for Aria2Client {
    fn force_pause_all(&self) -> QueueGlobalFuture<'_> {
        Box::pin(async move {
            // Ref: https://aria2.github.io/manual/en/html/aria2c.html#aria2-forcepauseall
            self.call::<String>("aria2.forcePauseAll", vec![])
                .await
                .map(|_| ())
                .map_err(|error| error.to_command_payload())
        })
    }

    fn unpause_all(&self) -> QueueGlobalFuture<'_> {
        Box::pin(async move {
            // Ref: https://aria2.github.io/manual/en/html/aria2c.html#aria2-unpauseall
            self.call::<String>("aria2.unpauseAll", vec![])
                .await
                .map(|_| ())
                .map_err(|error| error.to_command_payload())
        })
    }
}

struct E2eRetryClient;

impl RetryRpcClient for E2eRetryClient {
    fn add_uri(&self, _source_uri: String, _options: serde_json::Value) -> RetryFuture<'_> {
        Box::pin(async { Ok("e2e-retry-uri".to_string()) })
    }

    fn add_torrent(&self, _encoded: String, _options: serde_json::Value) -> RetryFuture<'_> {
        Box::pin(async { Ok("e2e-retry-torrent".to_string()) })
    }
}

enum CommandRetryClient {
    Real(Aria2RetryClient),
    E2e(E2eRetryClient),
}

impl RetryRpcClient for CommandRetryClient {
    fn add_uri(&self, source_uri: String, options: serde_json::Value) -> RetryFuture<'_> {
        match self {
            CommandRetryClient::Real(client) => client.add_uri(source_uri, options),
            CommandRetryClient::E2e(client) => client.add_uri(source_uri, options),
        }
    }

    fn add_torrent(&self, encoded: String, options: serde_json::Value) -> RetryFuture<'_> {
        match self {
            CommandRetryClient::Real(client) => client.add_torrent(encoded, options),
            CommandRetryClient::E2e(client) => client.add_torrent(encoded, options),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_destination_path, extract_display_name,
        prepare_direct_download_destination_with_reserved_paths,
    };
    use crate::services::download_paths::{CollisionNoticeKind, CollisionResolution};
    use crate::state::models::FileCollisionBehavior;

    #[test]
    fn extract_display_name_from_url() {
        assert_eq!(
            extract_display_name("https://example.com/file.zip?token=1"),
            "file.zip"
        );
    }

    #[test]
    fn build_destination_path_resolves_collisions() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "data").expect("write");

        let resolved =
            build_destination_path(dir.path().to_str().unwrap(), "file.txt").expect("path");

        assert!(resolved.contains("file(1).txt"));
    }

    #[test]
    fn prepare_direct_download_destination_returns_resolved_output_name() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "data").expect("write");

        let resolved = prepare_direct_download_destination_with_reserved_paths(
            dir.path().to_str().expect("dir"),
            "file.txt",
            FileCollisionBehavior::Rename,
            &[],
        )
        .expect("prepared")
        .expect("usable destination");

        assert_eq!(resolved.output_name, "file(1).txt");
        assert!(resolved.destination_path.ends_with("file(1).txt"));
    }

    #[test]
    fn prepare_direct_download_destination_blocks_skip_collisions() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("file.txt");
        std::fs::write(&path, "data").expect("write");

        let resolved = prepare_direct_download_destination_with_reserved_paths(
            dir.path().to_str().expect("dir"),
            "file.txt",
            FileCollisionBehavior::Skip,
            &[],
        )
        .expect("prepared");

        assert_eq!(
            resolved.expect_err("skip should block"),
            CollisionResolution::Blocked {
                kind: CollisionNoticeKind::SkippedSingleFile,
                path,
                message: "File already exists; skipped creating the download.".to_string(),
            }
        );
    }
}
