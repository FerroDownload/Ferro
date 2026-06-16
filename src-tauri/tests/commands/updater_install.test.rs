use std::sync::{Arc, Mutex};

use ferro_lib::commands::updater::{
    updater_download_and_install_with_provider, UpdateDownloadProgress, UpdateInstallFuture,
    UpdateInstallProvider, UpdateInstallEventEmitter, UpdateReadyEvent, UpdateRestarter,
    UPDATE_DOWNLOAD_PROGRESS_EVENT, UPDATE_READY_EVENT,
};

#[derive(Clone)]
enum StubInstallEvent {
    Progress {
        chunk_length: u64,
        content_length: Option<u64>,
    },
    Ready {
        version: String,
    },
}

#[derive(Clone)]
struct StubInstallProvider {
    result: Arc<Mutex<Result<Vec<StubInstallEvent>, String>>>,
}

impl StubInstallProvider {
    fn new(result: Result<Vec<StubInstallEvent>, String>) -> Self {
        Self {
            result: Arc::new(Mutex::new(result)),
        }
    }
}

impl UpdateInstallProvider for StubInstallProvider {
    fn download_and_install_update<'a>(
        &'a self,
        mut on_progress: Box<dyn FnMut(u64, Option<u64>) + Send + 'a>,
        on_ready: Box<dyn FnOnce(String) + Send + 'a>,
    ) -> UpdateInstallFuture<'a> {
        let result = self.result.lock().expect("provider result").clone();
        Box::pin(async move {
            let events = result?;
            let mut ready = Some(on_ready);
            for event in events {
                match event {
                    StubInstallEvent::Progress {
                        chunk_length,
                        content_length,
                    } => on_progress(chunk_length, content_length),
                    StubInstallEvent::Ready { version } => {
                        if let Some(on_ready) = ready.take() {
                            on_ready(version);
                        }
                    }
                }
            }
            Ok(())
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
enum RecordedInstallEvent {
    Progress(String, UpdateDownloadProgress),
    Ready(String, UpdateReadyEvent),
}

#[derive(Clone, Default)]
struct RecordingInstallEmitter {
    events: Arc<Mutex<Vec<RecordedInstallEvent>>>,
}

impl UpdateInstallEventEmitter for RecordingInstallEmitter {
    fn emit_download_progress(&self, progress: &UpdateDownloadProgress) -> Result<(), String> {
        self.events
            .lock()
            .expect("events")
            .push(RecordedInstallEvent::Progress(
                UPDATE_DOWNLOAD_PROGRESS_EVENT.to_string(),
                progress.clone(),
            ));
        Ok(())
    }

    fn emit_update_ready(&self, ready: &UpdateReadyEvent) -> Result<(), String> {
        self.events
            .lock()
            .expect("events")
            .push(RecordedInstallEvent::Ready(
                UPDATE_READY_EVENT.to_string(),
                ready.clone(),
            ));
        Ok(())
    }
}

#[derive(Clone, Default)]
struct RecordingRestarter {
    restart_count: Arc<Mutex<u32>>,
}

impl UpdateRestarter for RecordingRestarter {
    fn restart(&self) -> Result<(), String> {
        *self.restart_count.lock().expect("restart count") += 1;
        Ok(())
    }
}

#[test]
fn updater_download_and_install_emits_progress_ready_and_restarts() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let provider = StubInstallProvider::new(Ok(vec![
        StubInstallEvent::Progress {
            chunk_length: 100,
            content_length: Some(400),
        },
        StubInstallEvent::Progress {
            chunk_length: 300,
            content_length: Some(400),
        },
        StubInstallEvent::Ready {
            version: "0.2.0".to_string(),
        },
    ]));
    let emitter = RecordingInstallEmitter::default();
    let restarter = RecordingRestarter::default();

    runtime
        .block_on(updater_download_and_install_with_provider(
            provider,
            emitter.clone(),
            restarter.clone(),
        ))
        .expect("download and install");

    assert_eq!(
        emitter.events.lock().expect("events").as_slice(),
        &[
            RecordedInstallEvent::Progress(
                UPDATE_DOWNLOAD_PROGRESS_EVENT.to_string(),
                UpdateDownloadProgress {
                    downloaded_bytes: 100,
                    total_bytes: 400,
                    percent: 25.0,
                },
            ),
            RecordedInstallEvent::Progress(
                UPDATE_DOWNLOAD_PROGRESS_EVENT.to_string(),
                UpdateDownloadProgress {
                    downloaded_bytes: 400,
                    total_bytes: 400,
                    percent: 100.0,
                },
            ),
            RecordedInstallEvent::Ready(
                UPDATE_READY_EVENT.to_string(),
                UpdateReadyEvent {
                    version: "0.2.0".to_string(),
                },
            ),
        ]
    );
    assert_eq!(*restarter.restart_count.lock().expect("restart count"), 1);
}

#[test]
fn updater_download_and_install_returns_error_when_no_update_is_available() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let provider = StubInstallProvider::new(Err("No update available".to_string()));
    let emitter = RecordingInstallEmitter::default();
    let restarter = RecordingRestarter::default();

    let error = runtime
        .block_on(updater_download_and_install_with_provider(
            provider,
            emitter.clone(),
            restarter.clone(),
        ))
        .expect_err("missing update");

    assert_eq!(error, "No update available");
    assert!(emitter.events.lock().expect("events").is_empty());
    assert_eq!(*restarter.restart_count.lock().expect("restart count"), 0);
}

#[test]
fn updater_download_and_install_does_not_restart_after_install_failure() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let provider = StubInstallProvider::new(Err("signature verification failed".to_string()));
    let emitter = RecordingInstallEmitter::default();
    let restarter = RecordingRestarter::default();

    let error = runtime
        .block_on(updater_download_and_install_with_provider(
            provider,
            emitter,
            restarter.clone(),
        ))
        .expect_err("install failure");

    assert_eq!(error, "signature verification failed");
    assert_eq!(*restarter.restart_count.lock().expect("restart count"), 0);
}
