use std::future::Future;
use std::path::Path;
use std::pin::Pin;

use chrono::Utc;
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Emitter};

use crate::engine::aria2_client::build_options_map;
use crate::engine::aria2_client::Aria2Client;

pub const TRACKER_REFRESH_FAILED_EVENT: &str = "tracker:refresh_failed";
const DEFAULT_TRACKER_LIST_URL: &str =
    "https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_all.txt";

pub type TrackerFetchFuture<'a> = Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrackerRefreshMode {
    Auto,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct TrackerListRefreshResult {
    pub fetched_at: String,
    pub tracker_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackerRefreshOutcome {
    pub trackers: Vec<String>,
    pub fetched_at: Option<String>,
    pub tracker_count: usize,
    pub used_cache_after_failure: bool,
}

pub trait TrackerListFetcher {
    fn fetch_tracker_list(&self) -> TrackerFetchFuture<'_>;
}

pub trait TrackerRefreshEventEmitter {
    fn emit_tracker_refresh_failed(&self, reason: &str) -> Result<(), String>;
}

#[derive(Clone)]
pub struct HttpTrackerListFetcher {
    url: String,
}

impl Default for HttpTrackerListFetcher {
    fn default() -> Self {
        Self {
            url: DEFAULT_TRACKER_LIST_URL.to_string(),
        }
    }
}

impl TrackerListFetcher for HttpTrackerListFetcher {
    fn fetch_tracker_list(&self) -> TrackerFetchFuture<'_> {
        let url = self.url.clone();
        Box::pin(async move {
            let response = reqwest::get(&url)
                .await
                .map_err(|error| error.to_string())?;
            if !response.status().is_success() {
                return Err(format!("tracker list fetch failed: {}", response.status()));
            }
            response.text().await.map_err(|error| error.to_string())
        })
    }
}

#[derive(Clone)]
pub struct NoopTrackerRefreshEmitter;

impl TrackerRefreshEventEmitter for NoopTrackerRefreshEmitter {
    fn emit_tracker_refresh_failed(&self, _reason: &str) -> Result<(), String> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct TauriTrackerRefreshEmitter {
    app: AppHandle,
}

impl TauriTrackerRefreshEmitter {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl TrackerRefreshEventEmitter for TauriTrackerRefreshEmitter {
    fn emit_tracker_refresh_failed(&self, reason: &str) -> Result<(), String> {
        self.app
            .emit(
                TRACKER_REFRESH_FAILED_EVENT,
                serde_json::json!({ "reason": reason }),
            )
            .map_err(|error| error.to_string())
    }
}

pub async fn apply_tracker_refresh(
    client: &Aria2Client,
    gid: &str,
    trackers: &[String],
) -> Result<(), String> {
    if trackers.is_empty() {
        return Ok(());
    }

    // Ref: https://aria2.github.io/manual/en/html/aria2c.html (aria2.changeOption)
    client
        .change_option(gid, build_tracker_update(trackers))
        .await
        .map_err(|error| error.to_command_payload())?;

    Ok(())
}

pub fn build_tracker_update(trackers: &[String]) -> JsonValue {
    let tracker_list = trackers.join(",");
    build_options_map(vec![("bt-tracker", JsonValue::String(tracker_list))])
}

pub fn load_tracker_cache(cache_path: &Path) -> Result<Vec<String>, String> {
    if !cache_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(cache_path).map_err(|error| error.to_string())?;
    Ok(parse_tracker_lines(&content))
}

pub async fn refresh_tracker_list<F, E>(
    fetcher: &F,
    cache_path: &Path,
    mode: TrackerRefreshMode,
    emitter: &E,
) -> Result<TrackerRefreshOutcome, String>
where
    F: TrackerListFetcher,
    E: TrackerRefreshEventEmitter,
{
    let cached_trackers = load_tracker_cache(cache_path)?;

    match fetcher.fetch_tracker_list().await {
        Ok(content) => {
            let trackers = parse_tracker_lines(&content);
            persist_tracker_cache(cache_path, &trackers)?;
            let fetched_at = Utc::now().to_rfc3339();
            Ok(TrackerRefreshOutcome {
                tracker_count: trackers.len(),
                trackers,
                fetched_at: Some(fetched_at),
                used_cache_after_failure: false,
            })
        }
        Err(error) => match mode {
            TrackerRefreshMode::Auto => {
                log::warn!("Tracker list auto-refresh failed; using cached list");
                Ok(TrackerRefreshOutcome {
                    tracker_count: cached_trackers.len(),
                    trackers: cached_trackers,
                    fetched_at: None,
                    used_cache_after_failure: true,
                })
            }
            TrackerRefreshMode::Manual => {
                emitter.emit_tracker_refresh_failed(&error)?;
                Err(error)
            }
        },
    }
}

fn persist_tracker_cache(cache_path: &Path, trackers: &[String]) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    std::fs::write(cache_path, trackers.join("\n")).map_err(|error| error.to_string())
}

fn parse_tracker_lines(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect()
}
