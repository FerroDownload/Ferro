use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use ferro_lib::engine::engine_manager::{EngineConfig, EngineLauncher, EngineManager};
use ferro_lib::state::models::EngineProcessState;

fn crash_command() -> tokio::process::Command {
    if cfg!(windows) {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.args(["/C", "exit", "1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd
    } else {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.args(["-c", "exit 1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd
    }
}

struct CrashLauncher;

impl EngineLauncher for CrashLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        _rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        crash_command().spawn().map_err(|error| error.to_string())
    }
}

fn base_config(root: &Path) -> EngineConfig {
    EngineConfig {
        rpc_host: "127.0.0.1".to_string(),
        rpc_secret: None,
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
async fn crash_watcher_marks_state_and_invokes_handler() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let config = base_config(dir.path());
    let mut manager = EngineManager::new(config, CrashLauncher);
    let crashed = Arc::new(AtomicBool::new(false));
    let crashed_handle = Arc::clone(&crashed);

    manager.set_crash_handler(Arc::new(move || {
        crashed_handle.store(true, Ordering::SeqCst);
    }));

    let _status = match manager.start().await {
        Ok(status) => status,
        Err(error) => panic!("start engine error: {error:?}"),
    };

    let result = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if manager.status().process_state == EngineProcessState::Crashed {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await;

    assert!(result.is_ok(), "crash watcher timed out");
    assert!(crashed.load(Ordering::SeqCst));
}
