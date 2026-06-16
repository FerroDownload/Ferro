use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::time::{sleep, Duration};

use crate::commands::AppState;
use crate::engine::aria2_client::{build_options_map, Aria2Client};
use crate::services::download_paths::{
    collision_message, normalize_destination_dir, validate_multifile_destination,
    CollisionResolution, COLLISION_NOTICE_EVENT,
};
use crate::services::settings_store::{default_settings, AppSettingsStore};
use crate::services::task_repository::TaskRepository;
use crate::services::{torrent_settings, torrent_storage, trackers};
use crate::state::models::{FileCollisionBehavior, Task, TaskStatus, TorrentFile, TorrentMetadata};

const METADATA_RETRY_DELAY: Duration = Duration::from_millis(300);
const METADATA_RETRIES: usize = 20;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentSource {
    pub magnet: Option<String>,
    pub torrent_path: Option<String>,
}

fn is_e2e_mode() -> bool {
    std::env::var("FERRO_E2E").is_ok() || std::env::var("FERRO_DB_IN_MEMORY").is_ok()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTorrentPayload {
    pub source: TorrentSource,
    pub destination: String,
    pub selected_files: Vec<String>,
    pub selected_indices: Vec<u32>,
    pub info_hash: String,
    pub display_name: String,
    pub seed_ratio_target: f64,
    pub metadata: TorrentMetadata,
}

#[tauri::command]
pub async fn torrent_metadata(
    state: State<'_, AppState>,
    source: TorrentSource,
) -> Result<TorrentMetadata, String> {
    if is_e2e_mode() {
        return Ok(mock_metadata(source.magnet.as_deref()));
    }

    let client = build_client(&state).await;
    let download_dir = download_dir(&state).await;

    let gid = if let Some(magnet) = source.magnet.as_ref() {
        let options = build_options_map(vec![
            ("dir", JsonValue::String(download_dir.to_string())),
            ("bt-metadata-only", JsonValue::String("true".to_string())),
            ("bt-save-metadata", JsonValue::String("true".to_string())),
        ]);
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.addUri)
        client
            .call::<String>("aria2.addUri", vec![json!([magnet.clone()]), options])
            .await
            .map_err(|error| error.to_command_payload())?
    } else if let Some(path) = source.torrent_path.as_ref() {
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        let encoded = STANDARD.encode(bytes);
        let options = build_options_map(vec![("dir", JsonValue::String(download_dir.to_string()))]);
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.addTorrent)
        client
            .call::<String>("aria2.addTorrent", vec![json!(encoded), json!([]), options])
            .await
            .map_err(|error| error.to_command_payload())?
    } else {
        return Err("torrent source is required".to_string());
    };

    let metadata = poll_torrent_metadata(&client, &gid).await?;

    let _ = client
        .call::<String>("aria2.forceRemove", vec![json!(gid)])
        .await;

    Ok(metadata)
}

#[tauri::command]
pub async fn add_torrent_task(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: AddTorrentPayload,
) -> Result<(), String> {
    let destination_dir = resolve_destination_dir(&app, &payload.destination)?;
    let settings = AppSettingsStore::new(app.clone())
        .load()
        .unwrap_or_else(|_| default_settings());

    if payload.source.magnet.is_none() && payload.source.torrent_path.is_none() {
        return Err("torrent source is required".to_string());
    }

    if let Some(notice) = validate_torrent_destination(
        &destination_dir,
        &payload.selected_files,
        settings.file_collision_behavior,
    )? {
        emit_collision_notice(&app, &notice)?;
        return Err(collision_message(&notice)
            .unwrap_or("download collision")
            .to_string());
    }

    let gid = if is_e2e_mode() {
        "e2e-torrent".to_string()
    } else {
        let client = build_client(&state).await;
        let selected_indices = torrent_settings::format_selected_files(&payload.selected_indices);
        let options = build_options_map(torrent_settings::build_torrent_options(
            &destination_dir,
            &selected_indices,
            payload.seed_ratio_target,
        ));

        let gid = if let Some(magnet) = payload.source.magnet.as_ref() {
            // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.addUri)
            client
                .call::<String>("aria2.addUri", vec![json!([magnet.clone()]), options])
                .await
                .map_err(|error| error.to_command_payload())?
        } else if let Some(path) = payload.source.torrent_path.as_ref() {
            let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
            let encoded = STANDARD.encode(bytes);
            // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.addTorrent)
            client
                .call::<String>("aria2.addTorrent", vec![json!(encoded), json!([]), options])
                .await
                .map_err(|error| error.to_command_payload())?
        } else {
            return Err("torrent source is required".to_string());
        };

        if !payload.metadata.trackers.is_empty() {
            trackers::apply_tracker_refresh(&client, &gid, &payload.metadata.trackers).await?;
        }

        torrent_settings::apply_seed_ratio_stop_policy(&client, &gid, payload.seed_ratio_target)
            .await?;

        gid
    };

    if is_e2e_mode() {
        let _ = torrent_storage::save_metadata(&app, &payload.metadata);
    } else {
        torrent_storage::save_metadata(&app, &payload.metadata)
            .map_err(|error| error.to_string())?;
    }

    let destination_path = build_torrent_destination_path(&destination_dir, &payload.display_name)?;
    let timestamp = now_rfc3339();
    let task = Task {
        id: uuid::Uuid::new_v4().to_string(),
        aria2_gid: Some(gid),
        source_uri: source_uri(&payload),
        display_name: payload.display_name,
        destination_path,
        status: TaskStatus::Waiting,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: payload.metadata.total_bytes,
        download_speed_bps: 0,
        upload_speed_bps: 0,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: true,
        torrent_info_hash: Some(payload.info_hash),
        selected_files: Some(payload.selected_files),
    };

    let repo = TaskRepository::new(state.pool.clone());
    repo.create(&task).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_torrent_metadata(
    app: AppHandle,
    info_hash: String,
) -> Result<TorrentMetadata, String> {
    torrent_storage::load_metadata(&app, &info_hash).map_err(|error| error.to_string())
}

async fn poll_torrent_metadata(client: &Aria2Client, gid: &str) -> Result<TorrentMetadata, String> {
    for _ in 0..METADATA_RETRIES {
        let status: JsonValue = client
            .call(
                "aria2.tellStatus",
                vec![
                    json!(gid),
                    json!([
                        "infoHash",
                        "totalLength",
                        "bittorrent",
                        "connections",
                        "numSeeders"
                    ]),
                ],
            )
            .await
            .map_err(|error| error.to_command_payload())?;

        let info_hash = status
            .get("infoHash")
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .to_string();
        let total_bytes = status
            .get("totalLength")
            .and_then(JsonValue::as_str)
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        let peers = status
            .get("connections")
            .and_then(JsonValue::as_str)
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);
        let seeders = status
            .get("numSeeders")
            .and_then(JsonValue::as_str)
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0);

        if !info_hash.is_empty() {
            let files = fetch_torrent_files(client, gid).await?;
            let (name, trackers) = parse_bittorrent_details(status.get("bittorrent"));
            return Ok(TorrentMetadata {
                info_hash,
                name,
                total_bytes,
                files,
                trackers,
                peers,
                seeders,
            });
        }

        sleep(METADATA_RETRY_DELAY).await;
    }

    Err("timed out waiting for torrent metadata".to_string())
}

async fn fetch_torrent_files(client: &Aria2Client, gid: &str) -> Result<Vec<TorrentFile>, String> {
    let files: Vec<JsonValue> = client
        .call("aria2.getFiles", vec![json!(gid)])
        .await
        .map_err(|error| error.to_command_payload())?;

    Ok(files
        .into_iter()
        .map(|file| TorrentFile {
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
            bytes: file
                .get("length")
                .and_then(JsonValue::as_str)
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(0),
            completed_bytes: file
                .get("completedLength")
                .and_then(JsonValue::as_str)
                .and_then(|value| value.parse::<i64>().ok())
                .unwrap_or(0),
            selected: file
                .get("selected")
                .and_then(JsonValue::as_str)
                .map(|value| value == "true")
                .unwrap_or(false),
        })
        .collect())
}

fn parse_bittorrent_details(value: Option<&JsonValue>) -> (String, Vec<String>) {
    let mut name = "Torrent".to_string();
    let mut trackers = Vec::new();
    if let Some(bittorrent) = value {
        if let Some(info) = bittorrent.get("info") {
            if let Some(name_value) = info.get("name") {
                if let Some(name_str) = name_value.as_str() {
                    name = name_str.to_string();
                }
            }
        }
        if let Some(announce_list) = bittorrent.get("announceList") {
            if let Some(list) = announce_list.as_array() {
                for entry in list {
                    if let Some(inner) = entry.as_array() {
                        for uri in inner {
                            if let Some(uri_str) = uri.as_str() {
                                trackers.push(uri_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    (name, trackers)
}

fn mock_metadata(magnet: Option<&str>) -> TorrentMetadata {
    let info_hash = magnet
        .and_then(|value| value.split("btih:").nth(1))
        .and_then(|value| value.split('&').next())
        .unwrap_or("e2e")
        .to_string();
    TorrentMetadata {
        info_hash,
        name: "Example Torrent".to_string(),
        total_bytes: 2048,
        files: vec![
            TorrentFile {
                index: 1,
                path: "Example/file-a.bin".to_string(),
                bytes: 1024,
                completed_bytes: 0,
                selected: true,
            },
            TorrentFile {
                index: 2,
                path: "Example/file-b.bin".to_string(),
                bytes: 1024,
                completed_bytes: 0,
                selected: true,
            },
        ],
        trackers: vec!["udp://tracker.example".to_string()],
        peers: 2,
        seeders: 1,
    }
}

fn source_uri(payload: &AddTorrentPayload) -> String {
    if let Some(magnet) = payload.source.magnet.as_ref() {
        return magnet.clone();
    }
    if let Some(path) = payload.source.torrent_path.as_ref() {
        return path.clone();
    }
    String::new()
}

async fn build_client(state: &AppState) -> Aria2Client {
    let manager = state.engine.0.lock().await;
    let status = manager.status();
    let secret = manager
        .rpc_secret()
        .filter(|value| !value.trim().is_empty());
    Aria2Client::new(&status.rpc_host, status.rpc_port, secret)
}

async fn download_dir(state: &AppState) -> String {
    let manager = state.engine.0.lock().await;
    manager.download_dir().to_string_lossy().to_string()
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

fn validate_torrent_destination(
    destination_dir: &str,
    selected_files: &[String],
    behavior: FileCollisionBehavior,
) -> Result<Option<CollisionResolution>, String> {
    let dir = Path::new(destination_dir);
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let output_paths = selected_files
        .iter()
        .map(|file| dir.join(file))
        .collect::<Vec<_>>();

    Ok(validate_multifile_destination(&output_paths, behavior))
}

fn build_torrent_destination_path(
    destination_dir: &str,
    display_name: &str,
) -> Result<String, String> {
    let dir = Path::new(destination_dir);
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    Ok(dir.join(display_name).to_string_lossy().to_string())
}

fn emit_collision_notice(app: &AppHandle, notice: &CollisionResolution) -> Result<(), String> {
    app.emit(COLLISION_NOTICE_EVENT, notice)
        .map_err(|error| error.to_string())
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
