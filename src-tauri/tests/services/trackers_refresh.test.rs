use std::sync::{Arc, Mutex};

use ferro_lib::services::trackers::{
    load_tracker_cache, refresh_tracker_list, TrackerFetchFuture, TrackerListFetcher,
    TrackerRefreshEventEmitter, TrackerRefreshMode, TRACKER_REFRESH_FAILED_EVENT,
};

#[derive(Clone)]
struct StubTrackerFetcher {
    result: Arc<Mutex<Result<String, String>>>,
}

impl StubTrackerFetcher {
    fn new(result: Result<String, String>) -> Self {
        Self {
            result: Arc::new(Mutex::new(result)),
        }
    }
}

impl TrackerListFetcher for StubTrackerFetcher {
    fn fetch_tracker_list(&self) -> TrackerFetchFuture<'_> {
        let result = self.result.lock().expect("fetch result").clone();
        Box::pin(async move { result })
    }
}

#[derive(Clone, Default)]
struct RecordingTrackerEmitter {
    events: Arc<Mutex<Vec<(String, String)>>>,
}

impl TrackerRefreshEventEmitter for RecordingTrackerEmitter {
    fn emit_tracker_refresh_failed(&self, reason: &str) -> Result<(), String> {
        self.events
            .lock()
            .expect("events")
            .push((TRACKER_REFRESH_FAILED_EVENT.to_string(), reason.to_string()));
        Ok(())
    }
}

#[test]
fn manual_refresh_success_persists_plain_text_cache() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let dir = tempfile::tempdir().expect("temp dir");
    let cache_path = dir.path().join("trackers.txt");
    let fetcher = StubTrackerFetcher::new(Ok(
        "udp://tracker-a\n\n udp://tracker-b \n".to_string(),
    ));
    let emitter = RecordingTrackerEmitter::default();

    let outcome = runtime
        .block_on(refresh_tracker_list(
            &fetcher,
            &cache_path,
            TrackerRefreshMode::Manual,
            &emitter,
        ))
        .expect("refresh trackers");

    assert_eq!(
        outcome.trackers,
        vec!["udp://tracker-a".to_string(), "udp://tracker-b".to_string()]
    );
    assert_eq!(outcome.tracker_count, 2);
    assert!(outcome.fetched_at.is_some());
    assert_eq!(
        load_tracker_cache(&cache_path).expect("load cache"),
        outcome.trackers
    );
    assert!(emitter.events.lock().expect("events").is_empty());
}

#[test]
fn manual_refresh_failure_emits_event_and_retains_existing_cache() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let dir = tempfile::tempdir().expect("temp dir");
    let cache_path = dir.path().join("trackers.txt");
    std::fs::write(&cache_path, "udp://cached-tracker\n").expect("write cache");
    let fetcher = StubTrackerFetcher::new(Err("network unavailable".to_string()));
    let emitter = RecordingTrackerEmitter::default();

    let error = runtime
        .block_on(refresh_tracker_list(
            &fetcher,
            &cache_path,
            TrackerRefreshMode::Manual,
            &emitter,
        ))
        .expect_err("manual failure");

    assert_eq!(error, "network unavailable");
    assert_eq!(
        emitter.events.lock().expect("events").as_slice(),
        &[(
            TRACKER_REFRESH_FAILED_EVENT.to_string(),
            "network unavailable".to_string()
        )]
    );
    assert_eq!(
        load_tracker_cache(&cache_path).expect("load cache"),
        vec!["udp://cached-tracker".to_string()]
    );
}

#[test]
fn auto_refresh_failure_is_silent_and_uses_cached_list() {
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    let dir = tempfile::tempdir().expect("temp dir");
    let cache_path = dir.path().join("trackers.txt");
    std::fs::write(&cache_path, "udp://cached-tracker\n").expect("write cache");
    let fetcher = StubTrackerFetcher::new(Err("github timeout".to_string()));
    let emitter = RecordingTrackerEmitter::default();

    let outcome = runtime
        .block_on(refresh_tracker_list(
            &fetcher,
            &cache_path,
            TrackerRefreshMode::Auto,
            &emitter,
        ))
        .expect("auto refresh falls back to cache");

    assert_eq!(outcome.trackers, vec!["udp://cached-tracker".to_string()]);
    assert_eq!(outcome.tracker_count, 1);
    assert!(outcome.used_cache_after_failure);
    assert!(emitter.events.lock().expect("events").is_empty());
}

#[test]
fn missing_cache_loads_as_empty_list() {
    let dir = tempfile::tempdir().expect("temp dir");
    let cache_path = dir.path().join("trackers.txt");

    assert_eq!(load_tracker_cache(&cache_path).expect("load cache"), Vec::<String>::new());
}
