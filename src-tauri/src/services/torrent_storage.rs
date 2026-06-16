use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};

use crate::state::models::TorrentMetadata;

#[derive(Debug)]
pub enum TorrentStorageError {
    Io(String),
    Serde(String),
}

impl std::fmt::Display for TorrentStorageError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(message) => write!(formatter, "{message}"),
            Self::Serde(message) => write!(formatter, "{message}"),
        }
    }
}

impl From<std::io::Error> for TorrentStorageError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl From<serde_json::Error> for TorrentStorageError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serde(value.to_string())
    }
}

pub fn save_metadata(
    app: &AppHandle<impl Runtime>,
    metadata: &TorrentMetadata,
) -> Result<PathBuf, TorrentStorageError> {
    let dir = metadata_dir(app)?;
    save_metadata_to_dir(&dir, metadata)
}

pub fn load_metadata(
    app: &AppHandle<impl Runtime>,
    info_hash: &str,
) -> Result<TorrentMetadata, TorrentStorageError> {
    let dir = metadata_dir(app)?;
    load_metadata_from_dir(&dir, info_hash)
}

pub fn save_metadata_to_dir(
    dir: &std::path::Path,
    metadata: &TorrentMetadata,
) -> Result<PathBuf, TorrentStorageError> {
    let path = metadata_path_in_dir(dir, &metadata.info_hash);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let payload = serde_json::to_string_pretty(metadata)?;
    std::fs::write(&path, payload)?;
    Ok(path)
}

pub fn load_metadata_from_dir(
    dir: &std::path::Path,
    info_hash: &str,
) -> Result<TorrentMetadata, TorrentStorageError> {
    let path = metadata_path_in_dir(dir, info_hash);
    let contents = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&contents)?)
}

fn metadata_dir(app: &AppHandle<impl Runtime>) -> Result<PathBuf, TorrentStorageError> {
    app.path()
        .resolve("torrent-metadata", BaseDirectory::AppData)
        .map_err(|error| TorrentStorageError::Io(error.to_string()))
}

fn metadata_path_in_dir(dir: &std::path::Path, info_hash: &str) -> PathBuf {
    dir.join(format!("{info_hash}.json"))
}
