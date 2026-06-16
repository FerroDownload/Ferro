use std::sync::Arc;

use serde::Serialize;
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::commands::AppState;
use crate::engine::engine_manager::{
    Aria2Launcher, EngineManager, EngineStatus, SessionRecoveryNotice,
};
use crate::state::models::EngineProcessState;

pub const ENGINE_CRASH_EVENT: &str = "engine:crashed";
pub const ENGINE_SESSION_RECOVERED_EVENT: &str = "engine:session_recovered";
pub const ENGINE_STATE_CHANGED_EVENT: &str = "engine:state_changed";

#[derive(Clone)]
pub struct EngineState(pub Arc<Mutex<EngineManager<Aria2Launcher>>>);

impl EngineState {
    pub fn new(manager: EngineManager<Aria2Launcher>) -> Self {
        Self(Arc::new(Mutex::new(manager)))
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCrashEvent {
    pub message: String,
    pub restarted: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSessionRecoveredEvent {
    pub message: String,
    pub session_path: String,
    pub backup_path: String,
}

#[tauri::command]
pub async fn engine_status(state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let manager = state.engine.0.lock().await;
    if is_e2e_mode() {
        return Ok(e2e_engine_status(manager.status()));
    }

    Ok(manager.status())
}

#[tauri::command]
pub async fn engine_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<EngineStatus, String> {
    if is_e2e_mode() {
        let manager = state.engine.0.lock().await;
        return Ok(e2e_engine_status(manager.status()));
    }

    let mut manager = state.engine.0.lock().await;
    attach_engine_handlers(&app, &state, &mut manager);
    match manager.start().await {
        Ok(status) => Ok(status),
        Err(error) => Err(error.user_message()),
    }
}

#[tauri::command]
pub async fn engine_stop(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<EngineStatus, String> {
    let mut manager = state.engine.0.lock().await;
    attach_engine_handlers(&app, &state, &mut manager);
    manager.stop().await.map_err(|error| error.user_message())
}

#[tauri::command]
pub async fn engine_retry(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<EngineStatus, String> {
    let mut manager = state.engine.0.lock().await;
    attach_engine_handlers(&app, &state, &mut manager);
    manager
        .retry_from_failed_state()
        .await
        .map_err(|error| error.user_message())
}

#[tauri::command]
pub async fn engine_open_logs_folder(app: AppHandle) -> Result<(), String> {
    open_logs_folder(&app)
}

#[tauri::command]
pub async fn log_open_folder(app: AppHandle) -> Result<(), String> {
    open_logs_folder(&app)
}

fn attach_engine_handlers(
    app: &AppHandle,
    state: &AppState,
    manager: &mut crate::engine::engine_manager::EngineManager<Aria2Launcher>,
) {
    let event_app_handle = app.clone();
    manager.set_state_change_handler(Arc::new(move |status| {
        emit_engine_state(&event_app_handle, &status);
    }));

    let session_recovery_app_handle = app.clone();
    manager.set_session_recovery_handler(Arc::new(move |notice| {
        emit_session_recovered(&session_recovery_app_handle, &notice);
    }));

    let app_handle = app.clone();
    let state_handle = Arc::clone(&state.engine.0);
    manager.set_crash_handler(Arc::new(move || {
        let app_handle = app_handle.clone();
        let state_handle = Arc::clone(&state_handle);
        tokio::spawn(async move {
            let mut manager = state_handle.lock().await;
            let restarted = manager.recover_after_crash().await.is_ok();
            let message = if restarted {
                "Download engine restarted after crash".to_string()
            } else {
                "Download engine crashed and could not restart".to_string()
            };
            let _ = app_handle.emit(ENGINE_CRASH_EVENT, EngineCrashEvent { message, restarted });
        });
    }));
}

fn emit_engine_state(app: &AppHandle, status: &EngineStatus) {
    let _ = app.emit(ENGINE_STATE_CHANGED_EVENT, status);
}

fn emit_session_recovered(app: &AppHandle, notice: &SessionRecoveryNotice) {
    let _ = app.emit(
        ENGINE_SESSION_RECOVERED_EVENT,
        EngineSessionRecoveredEvent {
            message: notice.message.clone(),
            session_path: notice.session_path.to_string_lossy().to_string(),
            backup_path: notice.backup_path.to_string_lossy().to_string(),
        },
    );
}

fn open_logs_folder(app: &AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .resolve("", BaseDirectory::AppLog)
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;
    tauri_plugin_opener::open_path(log_dir, None::<&str>).map_err(|error| error.to_string())
}

fn is_e2e_mode() -> bool {
    std::env::var("FERRO_E2E").is_ok() || std::env::var("FERRO_DB_IN_MEMORY").is_ok()
}

fn e2e_engine_status(mut status: EngineStatus) -> EngineStatus {
    status.process_state = EngineProcessState::Running;
    status.restart_attempts_in_current_burst = 0;
    status.last_error_message = None;
    if status.rpc_port == 0 {
        status.rpc_port = 16800;
    }
    status
}

#[cfg(test)]
mod tests {
    use super::{
        e2e_engine_status, ENGINE_CRASH_EVENT, ENGINE_SESSION_RECOVERED_EVENT,
        ENGINE_STATE_CHANGED_EVENT,
    };
    use crate::engine::engine_manager::EngineStatus;
    use crate::state::models::EngineProcessState;

    #[test]
    fn event_names_match_contract() {
        assert_eq!(ENGINE_CRASH_EVENT, "engine:crashed");
        assert_eq!(ENGINE_SESSION_RECOVERED_EVENT, "engine:session_recovered");
        assert_eq!(ENGINE_STATE_CHANGED_EVENT, "engine:state_changed");
    }

    #[test]
    fn e2e_engine_status_reports_healthy_engine_without_launching_sidecar() {
        let status = e2e_engine_status(EngineStatus {
            process_state: EngineProcessState::EngineFailed,
            restart_attempts_in_current_burst: 3,
            last_error_message: Some("missing sidecar".to_string()),
            rpc_host: "127.0.0.1".to_string(),
            rpc_port: 0,
            config_path: "aria2.conf".to_string(),
            session_path: "aria2.session".to_string(),
            session_save_interval_seconds: 60,
            file_allocation: "falloc".to_string(),
        });

        assert_eq!(status.process_state, EngineProcessState::Running);
        assert_eq!(status.restart_attempts_in_current_burst, 0);
        assert_eq!(status.last_error_message, None);
        assert_eq!(status.rpc_port, 16800);
    }
}
