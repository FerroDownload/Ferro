use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use ferro_lib::engine::engine_manager::{
    EngineConfig, EngineLauncher, EngineManager, SessionRecoveryNotice,
};
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

#[derive(Clone, Default)]
struct RecordingLauncher {
    launches: Arc<Mutex<u8>>,
}

impl RecordingLauncher {
    fn launch_count(&self) -> u8 {
        *self.launches.lock().expect("launch count")
    }
}

impl EngineLauncher for RecordingLauncher {
    fn launch(
        &self,
        _config: &EngineConfig,
        _rpc_port: u16,
    ) -> Result<tokio::process::Child, String> {
        *self.launches.lock().expect("launch count") += 1;
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
async fn corrupt_session_file_is_backed_up_recreated_and_reported() {
    let dir = tempfile::tempdir().expect("temp dir");
    let config = base_config(dir.path());
    std::fs::create_dir_all(config.session_path.parent().expect("session parent"))
        .expect("create session parent");
    std::fs::write(&config.session_path, "this is not an aria2 input file")
        .expect("write corrupt session");

    let notices = Arc::new(Mutex::new(Vec::<SessionRecoveryNotice>::new()));
    let observed_notices = Arc::clone(&notices);
    let launcher = RecordingLauncher::default();
    let mut manager = EngineManager::new(config.clone(), launcher.clone());
    manager.set_session_recovery_handler(Arc::new(move |notice| {
        observed_notices
            .lock()
            .expect("session recovery notices")
            .push(notice);
    }));

    let status = manager.start().await.expect("start with recovered session");

    assert_eq!(status.process_state, EngineProcessState::Running);
    assert_eq!(launcher.launch_count(), 1);
    assert_eq!(
        std::fs::read_to_string(&config.session_path).expect("read fresh session"),
        ""
    );

    {
        let notices = notices.lock().expect("session recovery notices");
        assert_eq!(notices.len(), 1);
        let notice = notices.first().expect("recovery notice");
        assert_eq!(notice.session_path, config.session_path);
        assert_eq!(
            std::fs::read_to_string(&notice.backup_path).expect("read corrupt backup"),
            "this is not an aria2 input file"
        );
        assert_eq!(
            notice.backup_path.parent(),
            Some(config.session_path.parent().expect("session parent"))
        );
        assert!(notice
            .backup_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("aria2.session.corrupt.")));
        assert!(notice.message.contains("A fresh session was created"));
    }

    let _ = manager.stop().await;
}

#[tokio::test]
async fn valid_session_file_is_not_backed_up() {
    let dir = tempfile::tempdir().expect("temp dir");
    let config = base_config(dir.path());
    std::fs::create_dir_all(config.session_path.parent().expect("session parent"))
        .expect("create session parent");
    std::fs::write(
        &config.session_path,
        "https://example.com/file.iso\n  gid=0123456789abcdef\n  out=file.iso\n",
    )
    .expect("write valid session");

    let notices = Arc::new(Mutex::new(Vec::<SessionRecoveryNotice>::new()));
    let observed_notices = Arc::clone(&notices);
    let mut manager = EngineManager::new(config.clone(), RecordingLauncher::default());
    manager.set_session_recovery_handler(Arc::new(move |notice| {
        observed_notices
            .lock()
            .expect("session recovery notices")
            .push(notice);
    }));

    let status = manager.start().await.expect("start with valid session");

    assert_eq!(status.process_state, EngineProcessState::Running);
    assert_eq!(
        std::fs::read_to_string(&config.session_path).expect("read session"),
        "https://example.com/file.iso\n  gid=0123456789abcdef\n  out=file.iso\n"
    );
    assert!(notices.lock().expect("session recovery notices").is_empty());
    assert!(
        std::fs::read_dir(config.session_path.parent().expect("session parent"))
            .expect("read session parent")
            .filter_map(Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().contains(".corrupt."))
    );

    let _ = manager.stop().await;
}
