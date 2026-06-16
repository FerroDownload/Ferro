use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use ferro_lib::engine::engine_manager::{EngineConfig, EngineLauncher, EngineManager};
use ferro_lib::state::models::EngineProcessState;

fn sleep_command() -> tokio::process::Command {
    if cfg!(windows) {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args(["/C", "ping", "127.0.0.1", "-n", "3"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd
    } else {
        let mut cmd = tokio::process::Command::new("sleep");
        cmd.arg("2").stdout(Stdio::null()).stderr(Stdio::null());
        cmd
    }
}

struct SleepLauncher;

impl EngineLauncher for SleepLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        _rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        sleep_command().spawn().map_err(|error| error.to_string())
    }
}

struct FailingLauncher;

impl EngineLauncher for FailingLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        _rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        Err("spawn failed".to_string())
    }
}

fn base_config(root: &Path) -> EngineConfig {
    EngineConfig {
        rpc_host: "127.0.0.1".to_string(),
        rpc_secret: Some("secret".to_string()),
        config_path: root.join("state").join("aria2.conf"),
        download_dir: root.join("downloads"),
        max_concurrent_downloads: 5,
        max_connections_per_task: 16,
        session_path: root.join("state").join("aria2.session"),
        session_save_interval_seconds: 60,
        file_allocation: "falloc".to_string(),
        dht_enabled: false,
        pex_enabled: false,
        binary_path: PathBuf::from("aria2c"),
    }
}

#[tokio::test]
async fn state_change_handler_receives_start_and_stop_transitions() {
    let dir = tempfile::tempdir().expect("temp dir");
    let transitions = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&transitions);
    let mut manager = EngineManager::new(base_config(dir.path()), SleepLauncher);
    manager.set_state_change_handler(Arc::new(move |status| {
        observed
            .lock()
            .expect("observed transitions")
            .push(status.process_state);
    }));

    let started = manager.start().await.expect("start engine");
    let stopped = manager.stop().await.expect("stop engine");

    assert_eq!(started.process_state, EngineProcessState::Running);
    assert_eq!(stopped.process_state, EngineProcessState::Stopped);
    assert_eq!(
        *transitions.lock().expect("observed transitions"),
        vec![EngineProcessState::Running, EngineProcessState::Stopped]
    );
}

#[tokio::test]
async fn retry_from_failed_state_emits_restarting_then_running() {
    let dir = tempfile::tempdir().expect("temp dir");
    let transitions = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&transitions);
    let mut manager = EngineManager::new(base_config(dir.path()), SleepLauncher);
    manager.set_state_change_handler(Arc::new(move |status| {
        observed
            .lock()
            .expect("observed transitions")
            .push((
                status.process_state,
                status.restart_attempts_in_current_burst,
                status.last_error_message,
            ));
    }));

    manager.mark_engine_failed("health check failed");
    let retried = manager.retry_from_failed_state().await.expect("retry");

    assert_eq!(retried.process_state, EngineProcessState::Running);
    assert_eq!(
        *transitions.lock().expect("observed transitions"),
        vec![
            (
                EngineProcessState::EngineFailed,
                3,
                Some("health check failed".to_string())
            ),
            (EngineProcessState::Restarting, 0, None),
            (EngineProcessState::Running, 0, None),
        ]
    );

    let _ = manager.stop().await;
}

#[tokio::test]
async fn launch_failure_emits_engine_failed_status_payload() {
    let dir = tempfile::tempdir().expect("temp dir");
    let transitions = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&transitions);
    let mut manager = EngineManager::new(base_config(dir.path()), FailingLauncher);
    manager.set_state_change_handler(Arc::new(move |status| {
        observed
            .lock()
            .expect("observed transitions")
            .push((
                status.process_state,
                status.restart_attempts_in_current_burst,
                status.last_error_message,
            ));
    }));

    let error = manager.start().await.expect_err("start should fail");

    assert_eq!(
        error.user_message(),
        "Download engine failed to start: spawn failed"
    );
    assert_eq!(
        *transitions.lock().expect("observed transitions"),
        vec![(
            EngineProcessState::EngineFailed,
            3,
            Some("Download engine failed to start: spawn failed".to_string())
        )]
    );
}
