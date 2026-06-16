use std::sync::{Arc, Mutex};

use ferro_lib::commands::updater::{
    updater_check_with_provider, UpdateCheckProvider, UpdateEventEmitter, UpdateFuture,
    UpdateInfo, UPDATE_AVAILABLE_EVENT,
};

#[derive(Clone)]
struct StubUpdateProvider {
    result: Arc<Mutex<Result<Option<UpdateInfo>, String>>>,
}

impl StubUpdateProvider {
    fn new(result: Result<Option<UpdateInfo>, String>) -> Self {
        Self {
            result: Arc::new(Mutex::new(result)),
        }
    }
}

impl UpdateCheckProvider for StubUpdateProvider {
    fn check_update(&self) -> UpdateFuture<'_> {
        let result = self.result.lock().expect("provider result").clone();
        Box::pin(async move { result })
    }
}

#[derive(Clone, Default)]
struct RecordingEmitter {
    events: Arc<Mutex<Vec<(String, UpdateInfo)>>>,
}

impl UpdateEventEmitter for RecordingEmitter {
    fn emit_update_available(&self, update: &UpdateInfo) -> Result<(), String> {
        self.events
            .lock()
            .expect("events")
            .push((UPDATE_AVAILABLE_EVENT.to_string(), update.clone()));
        Ok(())
    }
}

fn update_info() -> UpdateInfo {
    UpdateInfo {
        version: "0.2.0".to_string(),
        current_version: "0.1.0".to_string(),
        notes: Some("Bug fixes".to_string()),
        pub_date: Some("2026-05-01T00:00:00Z".to_string()),
    }
}

#[test]
fn updater_check_reports_unavailable_without_emitting_event() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let provider = StubUpdateProvider::new(Ok(None));
    let emitter = RecordingEmitter::default();

    let result = runtime
        .block_on(updater_check_with_provider(provider, emitter.clone()))
        .expect("updater check");

    assert!(!result.available);
    assert_eq!(result.update, None);
    assert!(emitter.events.lock().expect("events").is_empty());
}

#[test]
fn updater_check_returns_update_metadata_and_emits_available_event() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let update = update_info();
    let provider = StubUpdateProvider::new(Ok(Some(update.clone())));
    let emitter = RecordingEmitter::default();

    let result = runtime
        .block_on(updater_check_with_provider(provider, emitter.clone()))
        .expect("updater check");

    assert!(result.available);
    assert_eq!(result.update, Some(update.clone()));

    let events = emitter.events.lock().expect("events");
    assert_eq!(events.as_slice(), &[(UPDATE_AVAILABLE_EVENT.to_string(), update)]);
}

#[test]
fn updater_check_propagates_provider_error_without_emitting_event() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let provider = StubUpdateProvider::new(Err("updater endpoint unreachable".to_string()));
    let emitter = RecordingEmitter::default();

    let error = runtime
        .block_on(updater_check_with_provider(provider, emitter.clone()))
        .expect_err("provider error");

    assert_eq!(error, "updater endpoint unreachable");
    assert!(emitter.events.lock().expect("events").is_empty());
}
