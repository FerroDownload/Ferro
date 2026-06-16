// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
pub mod commands;
pub mod engine;
pub mod services;
pub mod state;
pub mod tray;
pub mod ferro_log {
    pub use crate::uri_sensitive;
}
use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::Manager;
#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::commands::engine::EngineState;
use crate::commands::tasks::{
    add_task, cancel_task, check_download_space, delete_task_with_files, list_tasks,
    pause_all_tasks, pause_task, remove_task, reorder_task_to, resume_all_tasks, resume_task,
    retry_task,
};
use crate::commands::torrent::{add_torrent_task, get_torrent_metadata, torrent_metadata};
use crate::commands::trackers::refresh_trackers;
use crate::commands::updater::{updater_check, updater_download_and_install};
use crate::commands::window::window_close_requested;
use crate::commands::{engine as engine_commands, protocol, settings, AppState};
use crate::engine::engine_manager::{Aria2Launcher, EngineConfig, EngineManager};
use crate::services::db;
use crate::services::log_filter::should_keep_log_record;
use crate::services::logger_cleanup::cleanup_old_log_files;
use crate::services::notifications::request_permission_if_enabled;
use crate::services::settings_store::{default_settings, AppSettingsStore};
use crate::services::trackers::{
    refresh_tracker_list, HttpTrackerListFetcher, NoopTrackerRefreshEmitter, TrackerRefreshMode,
};
use crate::state::models::FileAllocationMethod;
use crate::tray::setup_system_tray;

#[cfg(any(windows, target_os = "linux"))]
fn register_deep_links_on_first_launch<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> Result<(), String> {
    let marker_path = app
        .path()
        .resolve("deep-link.registered", BaseDirectory::AppData)
        .map_err(|error| error.to_string())?;

    if marker_path.exists() {
        return Ok(());
    }

    app.deep_link()
        .register_all()
        .map_err(|error| error.to_string())?;

    if let Some(parent) = marker_path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            log::warn!("Unable to create deep-link registration marker directory: {error}");
            return Ok(());
        }
    }

    if let Err(error) = std::fs::write(&marker_path, "magnet\n") {
        log::warn!("Unable to write deep-link registration marker: {error}");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let updater_configured = context
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .is_some_and(|pubkey| !pubkey.trim().is_empty());

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            if let Err(error) = protocol::emit_magnet_uri_from_args(app, &argv) {
                log::warn!("Unable to emit magnet protocol event: {error}");
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("ferro".to_string()),
                }))
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(5 * 1024 * 1024)
                .level(log::LevelFilter::Info)
                .filter(should_keep_log_record)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    if updater_configured {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            register_deep_links_on_first_launch(app)?;

            setup_system_tray(app).map_err(|error| error.to_string())?;

            let log_dir = app
                .path()
                .resolve("", BaseDirectory::AppLog)
                .map_err(|error| error.to_string())?;
            if let Err(error) = cleanup_old_log_files(&log_dir, std::time::SystemTime::now()) {
                log::warn!("Unable to clean old log files: {error}");
            }

            let settings_store = AppSettingsStore::new(app.handle().clone());
            let settings = match settings_store.load() {
                Ok(settings) => settings,
                Err(_) => default_settings(),
            };
            if let Err(error) = request_permission_if_enabled(app.handle().clone()) {
                log::warn!("Unable to initialize notification permission: {error}");
            }
            if settings.auto_update_trackers {
                match app.path().resolve("trackers.txt", BaseDirectory::AppData) {
                    Ok(cache_path) => {
                        tauri::async_runtime::spawn(async move {
                            let fetcher = HttpTrackerListFetcher::default();
                            let emitter = NoopTrackerRefreshEmitter;
                            let _ = refresh_tracker_list(
                                &fetcher,
                                &cache_path,
                                TrackerRefreshMode::Auto,
                                &emitter,
                            )
                            .await;
                        });
                    }
                    Err(error) => {
                        log::warn!("Unable to resolve tracker cache path: {error}");
                    }
                }
            }

            let db_path = if let Ok(override_path) = std::env::var("FERRO_DB_PATH") {
                PathBuf::from(override_path)
            } else if std::env::var("FERRO_E2E").is_ok() {
                std::env::temp_dir().join("ferro-e2e").join("ferro.db")
            } else {
                app.path()
                    .resolve("ferro.db", BaseDirectory::AppData)
                    .map_err(|error| error.to_string())?
            };

            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }

            let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
            let db_recovery_notifier = db::TauriDbRecoveryNotifier::new(app.handle().clone());
            let pool = runtime
                .block_on(db::connect_with_migrations_and_recovery(
                    &db_path,
                    &db_recovery_notifier,
                ))
                .map_err(|error| format!("db error: {error:?}"))?;

            let download_dir = if settings.download_directory.is_empty() {
                app.path()
                    .resolve("", BaseDirectory::Download)
                    .map_err(|error| error.to_string())?
            } else {
                PathBuf::from(settings.download_directory)
            };

            let session_path = app
                .path()
                .resolve("aria2.session", BaseDirectory::AppData)
                .map_err(|error| error.to_string())?;

            let config_path = app
                .path()
                .resolve("aria2.conf", BaseDirectory::AppData)
                .map_err(|error| error.to_string())?;

            let binary_name = if cfg!(windows) {
                "aria2c.exe"
            } else {
                "aria2c"
            };
            let binary_path = app
                .path()
                .resolve(binary_name, BaseDirectory::Resource)
                .map_err(|error| format!("bundled aria2 resource not found: {error}"))?;

            if !binary_path.is_file() {
                return Err(format!(
                    "bundled aria2 resource is missing at {}. Run `pnpm setup:aria2` before starting Ferro.",
                    binary_path.display()
                )
                .into());
            }

            let engine_config = EngineConfig {
                rpc_host: "127.0.0.1".to_string(),
                rpc_secret: Some(uuid::Uuid::new_v4().simple().to_string()),
                config_path,
                download_dir,
                max_concurrent_downloads: settings.max_concurrent_downloads,
                max_connections_per_task: settings.max_connections_per_task,
                session_path,
                session_save_interval_seconds: 60,
                file_allocation: match settings.file_allocation_method {
                    FileAllocationMethod::Falloc => "falloc",
                    FileAllocationMethod::None => "none",
                    FileAllocationMethod::Prealloc => "prealloc",
                    FileAllocationMethod::Trunc => "trunc",
                }
                .to_string(),
                dht_enabled: settings.dht_enabled,
                pex_enabled: settings.pex_enabled,
                binary_path,
            };

            let engine_manager = EngineManager::new(engine_config, Aria2Launcher);
            let engine_state = EngineState::new(engine_manager);

            app.manage(AppState::new(pool, engine_state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_commands::engine_status,
            engine_commands::engine_start,
            engine_commands::engine_stop,
            engine_commands::engine_retry,
            engine_commands::engine_open_logs_folder,
            engine_commands::log_open_folder,
            settings::get_settings,
            settings::update_settings,
            check_download_space,
            list_tasks,
            add_task,
            pause_task,
            pause_all_tasks,
            resume_task,
            resume_all_tasks,
            cancel_task,
            remove_task,
            delete_task_with_files,
            retry_task,
            reorder_task_to,
            refresh_trackers,
            torrent_metadata,
            add_torrent_task,
            get_torrent_metadata,
            updater_check,
            updater_download_and_install,
            window_close_requested,
        ])
        .run(context)
        .expect("error while running tauri application");
}
