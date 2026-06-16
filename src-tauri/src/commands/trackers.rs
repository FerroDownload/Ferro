use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::services::trackers::{
    refresh_tracker_list, HttpTrackerListFetcher, TauriTrackerRefreshEmitter,
    TrackerListRefreshResult, TrackerRefreshMode,
};

#[tauri::command]
pub async fn refresh_trackers(app: AppHandle) -> Result<TrackerListRefreshResult, String> {
    let cache_path = app
        .path()
        .resolve("trackers.txt", BaseDirectory::AppData)
        .map_err(|error| error.to_string())?;
    let fetcher = HttpTrackerListFetcher::default();
    let emitter = TauriTrackerRefreshEmitter::new(app);

    let outcome =
        refresh_tracker_list(&fetcher, &cache_path, TrackerRefreshMode::Manual, &emitter).await?;

    Ok(TrackerListRefreshResult {
        fetched_at: outcome
            .fetched_at
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        tracker_count: outcome.tracker_count,
    })
}
