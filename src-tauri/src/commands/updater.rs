use std::future::Future;
use std::pin::Pin;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

pub const UPDATE_AVAILABLE_EVENT: &str = "update:available";
pub const UPDATE_DOWNLOAD_PROGRESS_EVENT: &str = "update:download_progress";
pub const UPDATE_READY_EVENT: &str = "update:ready";

pub type UpdateFuture<'a> =
    Pin<Box<dyn Future<Output = Result<Option<UpdateInfo>, String>> + Send + 'a>>;
pub type UpdateInstallFuture<'a> = Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub available: bool,
    pub update: Option<UpdateInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateDownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateReadyEvent {
    pub version: String,
}

pub trait UpdateCheckProvider {
    fn check_update(&self) -> UpdateFuture<'_>;
}

pub trait UpdateEventEmitter {
    fn emit_update_available(&self, update: &UpdateInfo) -> Result<(), String>;
}

pub trait UpdateInstallProvider {
    fn download_and_install_update<'a>(
        &'a self,
        on_progress: Box<dyn FnMut(u64, Option<u64>) + Send + 'a>,
        on_ready: Box<dyn FnOnce(String) + Send + 'a>,
    ) -> UpdateInstallFuture<'a>;
}

pub trait UpdateInstallEventEmitter: Clone + Send + 'static {
    fn emit_download_progress(&self, progress: &UpdateDownloadProgress) -> Result<(), String>;
    fn emit_update_ready(&self, ready: &UpdateReadyEvent) -> Result<(), String>;
}

pub trait UpdateRestarter {
    fn restart(&self) -> Result<(), String>;
}

#[derive(Clone)]
struct TauriUpdateCheckProvider {
    app: AppHandle,
}

impl TauriUpdateCheckProvider {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl UpdateCheckProvider for TauriUpdateCheckProvider {
    fn check_update(&self) -> UpdateFuture<'_> {
        let app = self.app.clone();
        Box::pin(async move {
            let update = app
                .updater()
                .map_err(|error| error.to_string())?
                .check()
                .await
                .map_err(|error| error.to_string())?;

            Ok(update.map(|update| UpdateInfo {
                version: update.version,
                current_version: update.current_version,
                notes: update.body,
                pub_date: update.date.map(|date| date.to_string()),
            }))
        })
    }
}

#[derive(Clone)]
struct TauriUpdateInstallProvider {
    app: AppHandle,
}

impl TauriUpdateInstallProvider {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl UpdateInstallProvider for TauriUpdateInstallProvider {
    fn download_and_install_update<'a>(
        &'a self,
        mut on_progress: Box<dyn FnMut(u64, Option<u64>) + Send + 'a>,
        on_ready: Box<dyn FnOnce(String) + Send + 'a>,
    ) -> UpdateInstallFuture<'a> {
        let app = self.app.clone();
        Box::pin(async move {
            let update = app
                .updater()
                .map_err(|error| error.to_string())?
                .check()
                .await
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "No update available".to_string())?;

            let version = update.version.clone();
            update
                .download_and_install(
                    move |chunk_length, content_length| {
                        on_progress(chunk_length as u64, content_length);
                    },
                    move || {
                        on_ready(version);
                    },
                )
                .await
                .map_err(|error| error.to_string())
        })
    }
}

#[derive(Clone)]
struct TauriUpdateEventEmitter {
    app: AppHandle,
}

impl TauriUpdateEventEmitter {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl UpdateEventEmitter for TauriUpdateEventEmitter {
    fn emit_update_available(&self, update: &UpdateInfo) -> Result<(), String> {
        self.app
            .emit(UPDATE_AVAILABLE_EVENT, update)
            .map_err(|error| error.to_string())
    }
}

#[derive(Clone)]
struct TauriUpdateInstallEventEmitter {
    app: AppHandle,
}

impl TauriUpdateInstallEventEmitter {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl UpdateInstallEventEmitter for TauriUpdateInstallEventEmitter {
    fn emit_download_progress(&self, progress: &UpdateDownloadProgress) -> Result<(), String> {
        self.app
            .emit(UPDATE_DOWNLOAD_PROGRESS_EVENT, progress)
            .map_err(|error| error.to_string())
    }

    fn emit_update_ready(&self, ready: &UpdateReadyEvent) -> Result<(), String> {
        self.app
            .emit(UPDATE_READY_EVENT, ready)
            .map_err(|error| error.to_string())
    }
}

#[derive(Clone)]
struct TauriUpdateRestarter {
    app: AppHandle,
}

impl TauriUpdateRestarter {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl UpdateRestarter for TauriUpdateRestarter {
    fn restart(&self) -> Result<(), String> {
        self.app.restart()
    }
}

pub async fn updater_check_with_provider<P, E>(
    provider: P,
    emitter: E,
) -> Result<UpdateCheckResult, String>
where
    P: UpdateCheckProvider,
    E: UpdateEventEmitter,
{
    let update = provider.check_update().await?;
    if let Some(update) = update {
        emitter.emit_update_available(&update)?;
        Ok(UpdateCheckResult {
            available: true,
            update: Some(update),
        })
    } else {
        Ok(UpdateCheckResult {
            available: false,
            update: None,
        })
    }
}

pub async fn updater_download_and_install_with_provider<P, E, R>(
    provider: P,
    emitter: E,
    restarter: R,
) -> Result<(), String>
where
    P: UpdateInstallProvider,
    E: UpdateInstallEventEmitter,
    R: UpdateRestarter,
{
    let downloaded_bytes = std::sync::Arc::new(std::sync::Mutex::new(0_u64));
    let callback_error = std::sync::Arc::new(std::sync::Mutex::new(None::<String>));

    let progress_emitter = emitter.clone();
    let progress_downloaded_bytes = std::sync::Arc::clone(&downloaded_bytes);
    let progress_callback_error = std::sync::Arc::clone(&callback_error);
    let on_progress = Box::new(move |chunk_length: u64, content_length: Option<u64>| {
        let Some(progress) =
            build_download_progress(&progress_downloaded_bytes, chunk_length, content_length)
        else {
            store_callback_error(
                &progress_callback_error,
                "Unable to update download progress".to_string(),
            );
            return;
        };

        if let Err(error) = progress_emitter.emit_download_progress(&progress) {
            store_callback_error(&progress_callback_error, error);
        }
    });

    let ready_emitter = emitter;
    let ready_callback_error = std::sync::Arc::clone(&callback_error);
    let on_ready = Box::new(move |version: String| {
        if let Err(error) = ready_emitter.emit_update_ready(&UpdateReadyEvent { version }) {
            store_callback_error(&ready_callback_error, error);
        }
    });

    provider
        .download_and_install_update(on_progress, on_ready)
        .await?;

    if let Some(error) = callback_error
        .lock()
        .map_err(|error| error.to_string())?
        .take()
    {
        return Err(error);
    }

    restarter.restart()
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateCheckResult, String> {
    updater_check_with_provider(
        TauriUpdateCheckProvider::new(app.clone()),
        TauriUpdateEventEmitter::new(app),
    )
    .await
}

#[tauri::command]
pub async fn updater_download_and_install(app: AppHandle) -> Result<(), String> {
    updater_download_and_install_with_provider(
        TauriUpdateInstallProvider::new(app.clone()),
        TauriUpdateInstallEventEmitter::new(app.clone()),
        TauriUpdateRestarter::new(app),
    )
    .await
}

fn build_download_progress(
    downloaded_bytes: &std::sync::Arc<std::sync::Mutex<u64>>,
    chunk_length: u64,
    content_length: Option<u64>,
) -> Option<UpdateDownloadProgress> {
    let mut downloaded = downloaded_bytes.lock().ok()?;
    *downloaded = downloaded.saturating_add(chunk_length);
    let total_bytes = content_length.unwrap_or(0);
    let percent = if total_bytes == 0 {
        0.0
    } else {
        ((*downloaded as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0)
    };

    Some(UpdateDownloadProgress {
        downloaded_bytes: *downloaded,
        total_bytes,
        percent,
    })
}

fn store_callback_error(
    callback_error: &std::sync::Arc<std::sync::Mutex<Option<String>>>,
    error: String,
) {
    if let Ok(mut callback_error) = callback_error.lock() {
        if callback_error.is_none() {
            *callback_error = Some(error);
        }
    }
}
