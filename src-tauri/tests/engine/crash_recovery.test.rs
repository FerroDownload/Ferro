use std::collections::VecDeque;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ferro_lib::engine::engine_manager::{
    EngineConfig, EngineLauncher, EngineManager, DEFAULT_RESTART_BACKOFFS,
};
use ferro_lib::state::models::EngineProcessState;

fn short_lived_command() -> tokio::process::Command {
    if cfg!(windows) {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args(["/C", "exit", "0"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd
    } else {
        let mut cmd = tokio::process::Command::new("sleep");
        cmd.arg("2").stdout(Stdio::null()).stderr(Stdio::null());
        cmd
    }
}

#[derive(Clone)]
struct HealthSequenceLauncher {
    launches: Arc<Mutex<u8>>,
    health_results: Arc<Mutex<VecDeque<Result<(), String>>>>,
}

impl HealthSequenceLauncher {
    fn new(results: Vec<Result<(), String>>) -> Self {
        Self {
            launches: Arc::new(Mutex::new(0)),
            health_results: Arc::new(Mutex::new(VecDeque::from(results))),
        }
    }

    fn launch_count(&self) -> u8 {
        *self.launches.lock().expect("launch count")
    }
}

impl EngineLauncher for HealthSequenceLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        _rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        *self.launches.lock().expect("launch count") += 1;
        short_lived_command()
            .spawn()
            .map_err(|error| error.to_string())
    }

    fn health_check<'a>(
        &'a self,
        _config: &'a EngineConfig,
        _rpc_port: u16,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async move {
            self.health_results
                .lock()
                .expect("health results")
                .pop_front()
                .unwrap_or(Ok(()))
        })
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

#[test]
fn default_restart_backoff_matches_fr040b() {
    assert_eq!(
        DEFAULT_RESTART_BACKOFFS,
        [
            Duration::from_secs(1),
            Duration::from_secs(2),
            Duration::from_secs(4),
        ],
    );
}

#[tokio::test]
async fn crash_recovery_retries_until_get_version_health_check_succeeds() {
    let dir = tempfile::tempdir().expect("temp dir");
    let launcher = HealthSequenceLauncher::new(vec![
        Err("aria2.getVersion connection refused".to_string()),
        Err("aria2.getVersion timed out".to_string()),
        Ok(()),
    ]);
    let mut manager = EngineManager::new(base_config(dir.path()), launcher.clone());
    manager.set_restart_backoffs(vec![
        Duration::from_millis(1),
        Duration::from_millis(2),
        Duration::from_millis(4),
    ]);
    let transitions = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&transitions);
    manager.set_state_change_handler(Arc::new(move |status| {
        observed.lock().expect("transitions").push((
            status.process_state,
            status.restart_attempts_in_current_burst,
            status.last_error_message,
        ));
    }));

    manager.mark_crashed("download engine exited unexpectedly");
    let status = manager
        .recover_after_crash()
        .await
        .expect("third health check should recover engine");

    assert_eq!(status.process_state, EngineProcessState::Running);
    assert_eq!(status.restart_attempts_in_current_burst, 0);
    assert_eq!(status.last_error_message, None);
    assert_eq!(launcher.launch_count(), 3);

    let transitions = transitions.lock().expect("transitions");
    assert_eq!(transitions.first().expect("first transition").0, EngineProcessState::Crashed);
    assert!(transitions.iter().any(|transition| {
        transition.0 == EngineProcessState::Restarting && transition.1 == 1
    }));
    assert!(transitions.iter().any(|transition| {
        transition.0 == EngineProcessState::Restarting && transition.1 == 2
    }));
    assert_eq!(
        transitions.last().expect("last transition"),
        &(EngineProcessState::Running, 0, None),
    );

}

#[tokio::test]
async fn crash_recovery_enters_engine_failed_after_three_failed_health_checks() {
    let dir = tempfile::tempdir().expect("temp dir");
    let launcher = HealthSequenceLauncher::new(vec![
        Err("aria2.getVersion refused".to_string()),
        Err("aria2.getVersion refused".to_string()),
        Err("aria2.getVersion refused".to_string()),
    ]);
    let mut manager = EngineManager::new(base_config(dir.path()), launcher.clone());
    manager.set_restart_backoffs(vec![
        Duration::from_millis(1),
        Duration::from_millis(2),
        Duration::from_millis(4),
    ]);

    manager.mark_crashed("download engine exited unexpectedly");
    let error = manager
        .recover_after_crash()
        .await
        .expect_err("all three restart attempts should fail");
    let status = manager.status();

    assert_eq!(launcher.launch_count(), 3);
    assert_eq!(status.process_state, EngineProcessState::EngineFailed);
    assert_eq!(status.restart_attempts_in_current_burst, 3);
    assert_eq!(
        status.last_error_message,
        Some("Download engine failed to restart after 3 attempts: aria2.getVersion refused".to_string()),
    );
    assert_eq!(
        error.user_message(),
        "Download engine failed to restart after 3 attempts: aria2.getVersion refused",
    );
}
