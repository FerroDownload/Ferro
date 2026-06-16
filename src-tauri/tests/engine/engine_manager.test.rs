use std::path::{Path, PathBuf};
use std::process::Stdio;

use ferro_lib::engine::engine_manager::{EngineConfig, EngineLauncher, EngineManager};
use ferro_lib::state::models::EngineProcessState;

fn sleep_command() -> tokio::process::Command {
    if cfg!(windows) {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args(["/C", "ping", "127.0.0.1", "-n", "6"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd
    } else {
        let mut cmd = tokio::process::Command::new("sleep");
        cmd.arg("5").stdout(Stdio::null()).stderr(Stdio::null());
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
async fn start_and_stop_engine() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let config = base_config(dir.path());
    let mut manager = EngineManager::new(config, SleepLauncher);

    let status = match manager.start().await {
        Ok(status) => status,
        Err(error) => panic!("start engine error: {error:?}"),
    };
    assert_eq!(status.process_state, EngineProcessState::Running);
    assert!(status.rpc_port >= 1024);

    let status = match manager.stop().await {
        Ok(status) => status,
        Err(error) => panic!("stop engine error: {error:?}"),
    };
    assert_eq!(status.process_state, EngineProcessState::Stopped);
    assert_eq!(status.rpc_port, 0);
}

#[tokio::test]
async fn start_creates_session_parent_dir() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let config = base_config(dir.path());
    let session_parent = config
        .session_path
        .parent()
        .unwrap_or_else(|| panic!("session parent missing"))
        .to_path_buf();
    let mut manager = EngineManager::new(config, SleepLauncher);

    let _status = match manager.start().await {
        Ok(status) => status,
        Err(error) => panic!("start engine error: {error:?}"),
    };

    assert!(session_parent.exists());

    let _ = manager.stop().await;
}
