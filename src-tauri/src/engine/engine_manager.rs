use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

use chrono::Utc;
use fs4::available_space;
use serde::{Deserialize, Serialize};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use tokio::task::JoinHandle;
use url::Url;

use crate::engine::aria2_client::Aria2Client;
use crate::state::models::EngineProcessState;

pub const MAX_RESTART_ATTEMPTS: u8 = 3;
pub const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(2);
pub const DEFAULT_RESTART_BACKOFFS: [Duration; 3] = [
    Duration::from_secs(1),
    Duration::from_secs(2),
    Duration::from_secs(4),
];
pub const SESSION_CORRUPTION_RECOVERED_MESSAGE: &str =
    "Download session could not be loaded. A fresh session was created; active downloads will be recovered from the engine.";

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub rpc_host: String,
    pub rpc_secret: Option<String>,
    pub config_path: PathBuf,
    pub download_dir: PathBuf,
    pub max_concurrent_downloads: u32,
    pub max_connections_per_task: u32,
    pub session_path: PathBuf,
    pub session_save_interval_seconds: u64,
    pub file_allocation: String,
    pub dht_enabled: bool,
    pub pex_enabled: bool,
    pub binary_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EngineStatus {
    pub process_state: EngineProcessState,
    pub restart_attempts_in_current_burst: u8,
    pub last_error_message: Option<String>,
    pub rpc_host: String,
    pub rpc_port: u16,
    pub config_path: String,
    pub session_path: String,
    pub session_save_interval_seconds: u64,
    pub file_allocation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRecoveryNotice {
    pub message: String,
    pub session_path: PathBuf,
    pub backup_path: PathBuf,
}

#[derive(Debug)]
pub enum EngineManagerError {
    InsufficientDisk {
        required_bytes: u64,
        available_bytes: u64,
    },
    InvalidState(String),
    Io(String),
    Spawn(String),
}

impl From<std::io::Error> for EngineManagerError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value.to_string())
    }
}

impl EngineManagerError {
    pub fn user_message(&self) -> String {
        match self {
            EngineManagerError::InsufficientDisk {
                required_bytes,
                available_bytes,
            } => format!(
                "Insufficient disk space: requires {required_bytes} bytes, only {available_bytes} available",
            ),
            EngineManagerError::InvalidState(message) => message.clone(),
            EngineManagerError::Io(message) | EngineManagerError::Spawn(message) => message.clone(),
        }
    }
}

pub const MIN_DISK_SPACE_BYTES: u64 = 100 * 1024 * 1024;

// Ref: https://context7.com/al8n/fs4-rs/llms.txt
pub fn check_disk_space(path: &Path, required_bytes: u64) -> Result<(), EngineManagerError> {
    let available =
        available_space(path).map_err(|error| EngineManagerError::Io(error.to_string()))?;
    if available < required_bytes {
        return Err(EngineManagerError::InsufficientDisk {
            required_bytes,
            available_bytes: available,
        });
    }
    Ok(())
}

pub trait EngineLauncher: Send + Sync + 'static {
    fn launch(&self, config: &EngineConfig, rpc_port: u16) -> Result<Child, String>;

    fn health_check<'a>(
        &'a self,
        _config: &'a EngineConfig,
        _rpc_port: u16,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async { Ok(()) })
    }
}

#[derive(Debug, Default)]
pub struct Aria2Launcher;

impl EngineLauncher for Aria2Launcher {
    fn launch(&self, config: &EngineConfig, rpc_port: u16) -> Result<Child, String> {
        let mut command = Command::new(&config.binary_path);
        command
            .args(build_aria2_args(config, rpc_port).map_err(|error| error.user_message())?)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        command.spawn().map_err(|error| error.to_string())
    }

    fn health_check<'a>(
        &'a self,
        config: &'a EngineConfig,
        rpc_port: u16,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async move {
            let client = Aria2Client::new(&config.rpc_host, rpc_port, config.rpc_secret.clone());
            client
                .get_version()
                .await
                .map(|_| ())
                .map_err(|error| error.to_string())
        })
    }
}

pub fn build_aria2_args(
    config: &EngineConfig,
    rpc_port: u16,
) -> Result<Vec<String>, EngineManagerError> {
    let rpc_secret = config.rpc_secret.as_ref().ok_or_else(|| {
        EngineManagerError::InvalidState(
            "engine RPC secret is required for the internal aria2 lifecycle".to_string(),
        )
    })?;

    let mut args = vec![
        "--enable-rpc=true".to_string(),
        "--rpc-listen-all=false".to_string(),
        "--disable-ipv6=true".to_string(),
        format!("--rpc-listen-port={rpc_port}"),
        format!("--rpc-secret={rpc_secret}"),
        format!("--stop-with-process={}", std::process::id()),
        format!(
            "--max-concurrent-downloads={}",
            config.max_concurrent_downloads
        ),
        format!("--split={}", config.max_connections_per_task),
        format!(
            "--max-connection-per-server={}",
            config.max_connections_per_task
        ),
        format!("--dir={}", config.download_dir.display()),
        format!("--save-session={}", config.session_path.display()),
        format!(
            "--save-session-interval={}",
            config.session_save_interval_seconds
        ),
        "--continue=true".to_string(),
        "--check-certificate=true".to_string(),
        format!("--file-allocation={}", config.file_allocation),
        format!("--enable-dht={}", config.dht_enabled),
        format!("--enable-dht6={}", config.dht_enabled),
        format!("--enable-peer-exchange={}", config.pex_enabled),
    ];

    if config.session_path.exists() {
        args.push(format!("--input-file={}", config.session_path.display()));
    }

    Ok(args)
}

type CrashHandler = Arc<dyn Fn() + Send + Sync + 'static>;
type StateChangeHandler = Arc<dyn Fn(EngineStatus) + Send + Sync + 'static>;
type SessionRecoveryHandler = Arc<dyn Fn(SessionRecoveryNotice) + Send + Sync + 'static>;

struct RuntimeState {
    process_state: EngineProcessState,
    rpc_port: u16,
    restart_attempts_in_current_burst: AtomicU8,
    last_error_message: Option<String>,
}

pub struct EngineManager<L: EngineLauncher> {
    config: EngineConfig,
    launcher: L,
    child: Arc<AsyncMutex<Option<Child>>>,
    state: Arc<Mutex<RuntimeState>>,
    watcher: Option<JoinHandle<()>>,
    crash_handler: Option<CrashHandler>,
    state_change_handler: Option<StateChangeHandler>,
    session_recovery_handler: Option<SessionRecoveryHandler>,
    restart_backoffs: Vec<Duration>,
}

impl<L: EngineLauncher> EngineManager<L> {
    pub fn new(config: EngineConfig, launcher: L) -> Self {
        Self {
            config,
            launcher,
            child: Arc::new(AsyncMutex::new(None)),
            state: Arc::new(Mutex::new(RuntimeState {
                process_state: EngineProcessState::Stopped,
                rpc_port: 0,
                restart_attempts_in_current_burst: AtomicU8::new(0),
                last_error_message: None,
            })),
            watcher: None,
            crash_handler: None,
            state_change_handler: None,
            session_recovery_handler: None,
            restart_backoffs: DEFAULT_RESTART_BACKOFFS.to_vec(),
        }
    }

    pub fn set_crash_handler(&mut self, handler: CrashHandler) {
        self.crash_handler = Some(handler);
    }

    pub fn set_state_change_handler(&mut self, handler: StateChangeHandler) {
        self.state_change_handler = Some(handler);
    }

    pub fn set_session_recovery_handler(&mut self, handler: SessionRecoveryHandler) {
        self.session_recovery_handler = Some(handler);
    }

    pub fn set_restart_backoffs(&mut self, restart_backoffs: Vec<Duration>) {
        self.restart_backoffs = if restart_backoffs.is_empty() {
            DEFAULT_RESTART_BACKOFFS.to_vec()
        } else {
            restart_backoffs
        };
    }

    pub fn status(&self) -> EngineStatus {
        let state = match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };

        status_from_state(&self.config, &state)
    }

    pub fn rpc_secret(&self) -> Option<String> {
        self.config.rpc_secret.clone()
    }

    pub fn download_dir(&self) -> PathBuf {
        self.config.download_dir.clone()
    }

    pub async fn start(&mut self) -> Result<EngineStatus, EngineManagerError> {
        let already_running = {
            let state = match self.state.lock() {
                Ok(state) => state,
                Err(poisoned) => poisoned.into_inner(),
            };
            state.process_state == EngineProcessState::Running
        };

        if already_running {
            return Ok(self.status());
        }

        self.start_attempt()
            .await
            .map_err(|error| self.record_launch_failure(error))
    }

    async fn start_attempt(&mut self) -> Result<EngineStatus, EngineManagerError> {
        ensure_parent_dir(&self.config.session_path)?;
        if let Some(notice) = recover_corrupt_session_file(&self.config.session_path)? {
            if let Some(handler) = &self.session_recovery_handler {
                handler(notice);
            }
        }
        ensure_dir(&self.config.download_dir)?;
        check_disk_space(&self.config.download_dir, MIN_DISK_SPACE_BYTES)?;

        let rpc_port = match reserve_ephemeral_port(&self.config.rpc_host) {
            Ok(port) => port,
            Err(error) => return Err(error),
        };
        let child = match self.launcher.launch(&self.config, rpc_port) {
            Ok(child) => child,
            Err(error) => return Err(EngineManagerError::Spawn(error)),
        };

        {
            let mut guard = self.child.lock().await;
            *guard = Some(child);
        }

        let health_check = tokio::time::timeout(
            HEALTH_CHECK_TIMEOUT,
            self.launcher.health_check(&self.config, rpc_port),
        )
        .await;

        match health_check {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                self.kill_current_child().await;
                return Err(EngineManagerError::Spawn(error));
            }
            Err(_) => {
                self.kill_current_child().await;
                return Err(EngineManagerError::Spawn(
                    "aria2.getVersion health check timed out".to_string(),
                ));
            }
        }

        self.watcher = Some(spawn_crash_watcher(
            Arc::clone(&self.child),
            Arc::clone(&self.state),
            self.config.clone(),
            self.crash_handler.clone(),
            self.state_change_handler.clone(),
        ));

        self.update_state(|state| {
            state.process_state = EngineProcessState::Running;
            state.rpc_port = rpc_port;
            state
                .restart_attempts_in_current_burst
                .store(0, Ordering::SeqCst);
            state.last_error_message = None;
        });

        Ok(self.status())
    }

    async fn kill_current_child(&self) {
        let mut guard = self.child.lock().await;
        if let Some(child) = guard.as_mut() {
            let _ = child.kill().await;
        }
        *guard = None;
    }

    pub async fn stop(&mut self) -> Result<EngineStatus, EngineManagerError> {
        if let Some(handle) = self.watcher.take() {
            handle.abort();
        }

        {
            let mut guard = self.child.lock().await;
            if let Some(child) = guard.as_mut() {
                let _ = child.kill().await;
            }
            *guard = None;
        }

        self.update_state(|state| {
            state.process_state = EngineProcessState::Stopped;
            state.rpc_port = 0;
            state
                .restart_attempts_in_current_burst
                .store(0, Ordering::SeqCst);
            state.last_error_message = None;
        });

        Ok(self.status())
    }

    pub fn mark_engine_failed(&self, message: impl Into<String>) {
        let message = message.into();
        self.update_state(|state| {
            state.process_state = EngineProcessState::EngineFailed;
            state
                .restart_attempts_in_current_burst
                .store(MAX_RESTART_ATTEMPTS, Ordering::SeqCst);
            state.last_error_message = Some(message);
        });
    }

    pub fn mark_crashed(&self, message: impl Into<String>) {
        let message = message.into();
        self.update_state(|state| {
            state.process_state = EngineProcessState::Crashed;
            state.rpc_port = 0;
            state.last_error_message = Some(message);
        });
    }

    fn record_launch_failure(&self, error: EngineManagerError) -> EngineManagerError {
        let message = format!("Download engine failed to start: {}", error.user_message());
        self.mark_engine_failed(message.clone());
        EngineManagerError::Spawn(message)
    }

    pub async fn retry_from_failed_state(&mut self) -> Result<EngineStatus, EngineManagerError> {
        {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(poisoned) => poisoned.into_inner(),
            };
            if state.process_state != EngineProcessState::EngineFailed {
                return Err(EngineManagerError::InvalidState(
                    "engine retry is only available when the engine is failed".to_string(),
                ));
            }
            state.process_state = EngineProcessState::Restarting;
            state
                .restart_attempts_in_current_burst
                .store(0, Ordering::SeqCst);
            state.last_error_message = None;
        }
        self.emit_state_changed();

        self.start().await
    }

    pub async fn recover_after_crash(&mut self) -> Result<EngineStatus, EngineManagerError> {
        self.update_state(|state| {
            state.process_state = EngineProcessState::Restarting;
            state.rpc_port = 0;
            state
                .restart_attempts_in_current_burst
                .store(0, Ordering::SeqCst);
            state.last_error_message = None;
        });

        let mut last_error_message = "unknown engine restart error".to_string();
        for (index, backoff) in self
            .restart_backoffs
            .clone()
            .into_iter()
            .take(MAX_RESTART_ATTEMPTS as usize)
            .enumerate()
        {
            tokio::time::sleep(backoff).await;
            match self.start_attempt().await {
                Ok(status) => return Ok(status),
                Err(error) => {
                    let attempt = (index + 1) as u8;
                    last_error_message = error.user_message();
                    log::error!(
                        "Download engine restart attempt {attempt} failed: {last_error_message}"
                    );

                    if attempt == MAX_RESTART_ATTEMPTS {
                        let message = format!(
                            "Download engine failed to restart after {MAX_RESTART_ATTEMPTS} attempts: {last_error_message}"
                        );
                        self.update_state(|state| {
                            state.process_state = EngineProcessState::EngineFailed;
                            state.rpc_port = 0;
                            state
                                .restart_attempts_in_current_burst
                                .store(MAX_RESTART_ATTEMPTS, Ordering::SeqCst);
                            state.last_error_message = Some(message.clone());
                        });
                        return Err(EngineManagerError::Spawn(message));
                    }

                    self.update_state(|state| {
                        state.process_state = EngineProcessState::Restarting;
                        state.rpc_port = 0;
                        state
                            .restart_attempts_in_current_burst
                            .store(attempt, Ordering::SeqCst);
                        state.last_error_message = Some(last_error_message.clone());
                    });
                }
            }
        }

        let message = format!(
            "Download engine failed to restart after {MAX_RESTART_ATTEMPTS} attempts: {last_error_message}"
        );
        self.mark_engine_failed(message.clone());
        Err(EngineManagerError::Spawn(message))
    }

    fn update_state(&self, update: impl FnOnce(&mut RuntimeState)) {
        {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(poisoned) => poisoned.into_inner(),
            };
            update(&mut state);
        }
        self.emit_state_changed();
    }

    fn emit_state_changed(&self) {
        if let Some(handler) = &self.state_change_handler {
            handler(self.status());
        }
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), EngineManagerError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn recover_corrupt_session_file(
    session_path: &Path,
) -> Result<Option<SessionRecoveryNotice>, EngineManagerError> {
    if !session_path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(session_path)?;
    let is_valid = match String::from_utf8(bytes) {
        Ok(contents) => is_valid_aria2_input_file(&contents),
        Err(_) => false,
    };

    if is_valid {
        return Ok(None);
    }

    let backup_path = backup_corrupt_session_file(session_path)?;
    std::fs::write(session_path, "")?;

    Ok(Some(SessionRecoveryNotice {
        message: SESSION_CORRUPTION_RECOVERED_MESSAGE.to_string(),
        session_path: session_path.to_path_buf(),
        backup_path,
    }))
}

fn backup_corrupt_session_file(session_path: &Path) -> Result<PathBuf, EngineManagerError> {
    let parent = session_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = session_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("aria2.session");
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ");
    let mut backup_path = parent.join(format!("{file_name}.corrupt.{timestamp}"));

    for suffix in 1.. {
        if !backup_path.exists() {
            break;
        }
        backup_path = parent.join(format!("{file_name}.corrupt.{timestamp}.{suffix}"));
    }

    std::fs::rename(session_path, &backup_path)?;
    Ok(backup_path)
}

fn is_valid_aria2_input_file(contents: &str) -> bool {
    let mut has_current_item = false;

    for raw_line in contents.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with(' ') || line.starts_with('\t') {
            if !has_current_item || !is_valid_aria2_input_option(line.trim()) {
                return false;
            }
            continue;
        }

        if line
            .split('\t')
            .map(str::trim)
            .any(|item| !is_valid_aria2_input_item(item))
        {
            return false;
        }
        has_current_item = true;
    }

    true
}

fn is_valid_aria2_input_option(option: &str) -> bool {
    let Some((name, _value)) = option.split_once('=') else {
        return false;
    };
    !name.is_empty()
        && !name.starts_with("--")
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn is_valid_aria2_input_item(item: &str) -> bool {
    if item.is_empty() || item.starts_with('"') || item.starts_with('\'') {
        return false;
    }

    if item.starts_with("magnet:?") {
        return true;
    }

    if let Ok(url) = Url::parse(item) {
        return matches!(url.scheme(), "http" | "https" | "ftp" | "sftp");
    }

    item.ends_with(".torrent") || item.ends_with(".metalink") || item.ends_with(".meta4")
}

fn ensure_dir(path: &Path) -> Result<(), EngineManagerError> {
    std::fs::create_dir_all(path)?;
    Ok(())
}

fn reserve_ephemeral_port(host: &str) -> Result<u16, EngineManagerError> {
    let listener = std::net::TcpListener::bind(format!("{host}:0"))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn spawn_crash_watcher(
    child: Arc<AsyncMutex<Option<Child>>>,
    state: Arc<Mutex<RuntimeState>>,
    config: EngineConfig,
    crash_handler: Option<CrashHandler>,
    state_change_handler: Option<StateChangeHandler>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        {
            let mut guard = child.lock().await;
            if let Some(child) = guard.as_mut() {
                let _ = child.wait().await;
            } else {
                return;
            }
            *guard = None;
        }

        let status = match state.lock() {
            Ok(mut state) => {
                state.process_state = EngineProcessState::Crashed;
                state.last_error_message = Some("download engine exited unexpectedly".to_string());
                Some(status_from_state(&config, &state))
            }
            Err(poisoned) => {
                let mut state = poisoned.into_inner();
                state.process_state = EngineProcessState::Crashed;
                state.last_error_message = Some("download engine exited unexpectedly".to_string());
                Some(status_from_state(&config, &state))
            }
        };

        if let (Some(handler), Some(status)) = (state_change_handler, status) {
            handler(status);
        }

        if let Some(handler) = crash_handler {
            handler();
        }
    })
}

fn status_from_state(config: &EngineConfig, state: &RuntimeState) -> EngineStatus {
    EngineStatus {
        process_state: state.process_state,
        restart_attempts_in_current_burst: state
            .restart_attempts_in_current_burst
            .load(Ordering::SeqCst),
        last_error_message: state.last_error_message.clone(),
        rpc_host: config.rpc_host.clone(),
        rpc_port: state.rpc_port,
        config_path: config.config_path.to_string_lossy().to_string(),
        session_path: config.session_path.to_string_lossy().to_string(),
        session_save_interval_seconds: config.session_save_interval_seconds,
        file_allocation: config.file_allocation.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_aria2_args, Aria2Launcher, EngineConfig, EngineLauncher, EngineManager,
        MIN_DISK_SPACE_BYTES,
    };
    use crate::state::models::EngineProcessState;
    use std::path::{Path, PathBuf};
    use std::process::Stdio;
    use std::sync::{Arc, Mutex};

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

    fn test_config(root: &Path) -> EngineConfig {
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
    fn status_includes_static_engine_configuration() {
        let config = EngineConfig {
            rpc_host: "127.0.0.1".to_string(),
            rpc_secret: Some("secret".to_string()),
            config_path: PathBuf::from("C:/Ferro/aria2.conf"),
            download_dir: PathBuf::from("C:/Users/Test/Downloads"),
            max_concurrent_downloads: 5,
            max_connections_per_task: 16,
            session_path: PathBuf::from("C:/Ferro/aria2.session"),
            session_save_interval_seconds: 60,
            file_allocation: "falloc".to_string(),
            dht_enabled: false,
            pex_enabled: false,
            binary_path: PathBuf::from("aria2c"),
        };
        let manager = EngineManager::new(config, Aria2Launcher);

        let status = manager.status();

        assert_eq!(status.process_state, EngineProcessState::Stopped);
        assert_eq!(status.restart_attempts_in_current_burst, 0);
        assert_eq!(status.last_error_message, None);
        assert_eq!(status.rpc_port, 0);
        assert_eq!(
            PathBuf::from(status.config_path),
            PathBuf::from("C:/Ferro/aria2.conf")
        );
        assert_eq!(
            PathBuf::from(status.session_path),
            PathBuf::from("C:/Ferro/aria2.session")
        );
        assert_eq!(status.session_save_interval_seconds, 60);
        assert_eq!(status.file_allocation, "falloc");
        assert_eq!(MIN_DISK_SPACE_BYTES, 100 * 1024 * 1024);
    }

    #[test]
    fn aria2_args_match_current_rpc_lifecycle_requirements() {
        let root = tempfile::tempdir().expect("temp dir");
        let config = test_config(root.path());
        std::fs::create_dir_all(config.session_path.parent().expect("session parent"))
            .expect("create session parent");
        std::fs::write(&config.session_path, "").expect("create session file");

        let args = build_aria2_args(&config, 6881).expect("build args");

        assert!(args.contains(&"--enable-rpc=true".to_string()));
        assert!(args.contains(&"--rpc-listen-all=false".to_string()));
        assert!(args.contains(&"--disable-ipv6=true".to_string()));
        assert!(args.contains(&"--rpc-listen-port=6881".to_string()));
        assert!(args.contains(&"--rpc-secret=secret".to_string()));
        assert!(args.contains(&format!("--stop-with-process={}", std::process::id())));
        assert!(args.contains(&format!("--save-session={}", config.session_path.display())));
        assert!(args.contains(&format!("--input-file={}", config.session_path.display())));
        assert!(args.contains(&"--save-session-interval=60".to_string()));
        assert!(args.contains(&"--continue=true".to_string()));
        assert!(args.contains(&"--check-certificate=true".to_string()));
        assert!(args.contains(&"--max-concurrent-downloads=5".to_string()));
        assert!(args.contains(&"--split=16".to_string()));
        assert!(args.contains(&"--max-connection-per-server=16".to_string()));
        assert!(args.contains(&format!("--dir={}", config.download_dir.display())));
        assert!(args.contains(&"--file-allocation=falloc".to_string()));
        assert!(args.contains(&"--enable-dht=false".to_string()));
        assert!(args.contains(&"--enable-dht6=false".to_string()));
        assert!(args.contains(&"--enable-peer-exchange=false".to_string()));
    }

    #[tokio::test]
    async fn start_reserves_a_random_rpc_port_and_stop_resets_it() {
        let root = tempfile::tempdir().expect("temp dir");
        let selected_ports = Arc::new(Mutex::new(Vec::new()));
        let config = test_config(root.path());
        let mut manager = EngineManager::new(
            config,
            CapturingLauncher {
                selected_ports: Arc::clone(&selected_ports),
            },
        );

        let status = manager.start().await.expect("start engine");
        let selected_port = {
            let captured_ports = selected_ports.lock().expect("selected ports");
            *captured_ports.last().expect("captured rpc port")
        };

        assert!(selected_port >= 1024);
        assert_eq!(status.rpc_port, selected_port);

        let stopped = manager.stop().await.expect("stop engine");
        assert_eq!(stopped.rpc_port, 0);
    }

    #[tokio::test]
    async fn start_when_already_running_returns_without_relocking_status() {
        let root = tempfile::tempdir().expect("temp dir");
        let selected_ports = Arc::new(Mutex::new(Vec::new()));
        let mut manager = EngineManager::new(
            test_config(root.path()),
            CapturingLauncher {
                selected_ports: Arc::clone(&selected_ports),
            },
        );
        let first = manager.start().await.expect("first start");

        let second = tokio::time::timeout(std::time::Duration::from_secs(1), manager.start())
            .await
            .expect("second start should not deadlock")
            .expect("second start");

        assert_eq!(second.process_state, EngineProcessState::Running);
        assert_eq!(second.rpc_port, first.rpc_port);
        assert_eq!(selected_ports.lock().expect("selected ports").len(), 1);

        let _ = manager.stop().await;
    }

    #[tokio::test]
    async fn retry_from_failed_state_restarts_and_clears_failure_state() {
        let root = tempfile::tempdir().expect("temp dir");
        let selected_ports = Arc::new(Mutex::new(Vec::new()));
        let mut manager = EngineManager::new(
            test_config(root.path()),
            CapturingLauncher {
                selected_ports: Arc::clone(&selected_ports),
            },
        );
        manager.mark_engine_failed("previous failure");

        let status = manager.retry_from_failed_state().await.expect("retry");

        assert_eq!(status.process_state, EngineProcessState::Running);
        assert_eq!(status.restart_attempts_in_current_burst, 0);
        assert_eq!(status.last_error_message, None);
        assert_eq!(selected_ports.lock().expect("selected ports").len(), 1);

        let _ = manager.stop().await;
    }

    #[tokio::test]
    async fn retry_from_failed_state_rejects_other_states() {
        let root = tempfile::tempdir().expect("temp dir");
        let mut manager = EngineManager::new(test_config(root.path()), FailingLauncher);

        let error = manager
            .retry_from_failed_state()
            .await
            .expect_err("retry should reject non-failed state");

        assert_eq!(
            error.user_message(),
            "engine retry is only available when the engine is failed",
        );
    }

    #[tokio::test]
    async fn start_launch_error_sets_engine_failed_status_for_ui_surface() {
        let root = tempfile::tempdir().expect("temp dir");
        let mut manager = EngineManager::new(test_config(root.path()), FailingLauncher);

        let error = manager.start().await.expect_err("start should fail");
        let status = manager.status();

        assert_eq!(
            error.user_message(),
            "Download engine failed to start: spawn failed",
        );
        assert_eq!(status.process_state, EngineProcessState::EngineFailed);
        assert_eq!(
            status.last_error_message,
            Some("Download engine failed to start: spawn failed".to_string()),
        );
    }
}
