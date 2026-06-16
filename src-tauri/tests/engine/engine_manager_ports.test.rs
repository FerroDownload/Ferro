use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use ferro_lib::engine::engine_manager::{
    build_aria2_args, EngineConfig, EngineLauncher, EngineManager,
};

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

struct CapturingLauncher {
    selected_ports: Arc<Mutex<Vec<u16>>>,
}

impl EngineLauncher for CapturingLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        self.selected_ports
            .lock()
            .expect("selected ports")
            .push(rpc_port);
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
async fn start_selects_a_free_ephemeral_rpc_port() {
    let dir = match tempfile::tempdir() {
        Ok(dir) => dir,
        Err(error) => panic!("temp dir error: {error}"),
    };
    let selected_ports = Arc::new(Mutex::new(Vec::new()));
    let launcher = CapturingLauncher {
        selected_ports: Arc::clone(&selected_ports),
    };
    let config = base_config(dir.path());
    let mut manager = EngineManager::new(config, launcher);

    let status = manager.start().await.expect("start engine");
    let port = {
        let recorded = selected_ports.lock().expect("selected ports");
        *recorded.last().expect("selected port")
    };

    assert!(port >= 1024);
    assert_ne!(port, 16800);
    assert_eq!(status.rpc_port, port);

    let _ = manager.stop().await;
}

#[test]
fn launch_args_use_reserved_port_instead_of_fixed_default() {
    let dir = tempfile::tempdir().expect("temp dir");
    let config = base_config(dir.path());

    let args = build_aria2_args(&config, 49152).expect("build args");

    assert!(args.contains(&"--rpc-listen-port=49152".to_string()));
    assert!(!args.contains(&"--rpc-listen-port=16800".to_string()));
    assert!(args.contains(&"--rpc-secret=secret".to_string()));
}

#[test]
fn launch_args_reject_missing_rpc_secret() {
    let dir = tempfile::tempdir().expect("temp dir");
    let mut config = base_config(dir.path());
    config.rpc_secret = None;

    let error = build_aria2_args(&config, 49152).expect_err("missing secret should fail");

    assert_eq!(
        error.user_message(),
        "engine RPC secret is required for the internal aria2 lifecycle",
    );
}

#[test]
fn launch_args_load_existing_session_file_only_when_present() {
    let dir = tempfile::tempdir().expect("temp dir");
    let config = base_config(dir.path());

    let args_without_session = build_aria2_args(&config, 49152).expect("build args");
    assert!(!args_without_session
        .iter()
        .any(|arg| arg.starts_with("--input-file=")));

    std::fs::create_dir_all(config.session_path.parent().expect("session parent"))
        .expect("create session parent");
    std::fs::write(&config.session_path, "").expect("create session file");

    let args_with_session = build_aria2_args(&config, 49152).expect("build args");
    assert!(args_with_session.contains(&format!(
        "--input-file={}",
        config.session_path.display()
    )));
}
