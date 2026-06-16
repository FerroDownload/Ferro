use std::sync::{Arc, Mutex};

use ferro_lib::services::speed_aggregator::{
    aggregate_current_speeds, update_tray_tooltip_from_tasks, TrayTooltipUpdater,
};
use ferro_lib::state::models::{Task, TaskStatus};

fn sample_task(id: &str, status: TaskStatus, download: i64, upload: i64) -> Task {
    Task {
        id: id.to_string(),
        aria2_gid: Some(format!("gid-{id}")),
        source_uri: "https://example.com/file.iso".to_string(),
        display_name: "file.iso".to_string(),
        destination_path: "C:/Users/Test/Downloads/file.iso".to_string(),
        status,
        progress_percent: 0.0,
        downloaded_bytes: 0,
        total_bytes: 1024,
        download_speed_bps: download,
        upload_speed_bps: upload,
        created_at: "2026-02-04T00:00:00Z".to_string(),
        updated_at: "2026-02-04T00:00:00Z".to_string(),
        completed_at: None,
        uploaded_bytes: 0,
        orphan_imported: false,
        error_message: None,
        is_torrent: false,
        torrent_info_hash: None,
        selected_files: None,
    }
}

#[derive(Clone, Default)]
struct RecordingTooltipUpdater {
    values: Arc<Mutex<Vec<String>>>,
}

impl RecordingTooltipUpdater {
    fn values(&self) -> Vec<String> {
        self.values.lock().expect("values").clone()
    }
}

impl TrayTooltipUpdater for RecordingTooltipUpdater {
    fn set_tooltip(&self, tooltip: String) -> Result<(), String> {
        self.values.lock().expect("values").push(tooltip);
        Ok(())
    }
}

#[test]
fn aggregates_only_active_task_speeds() {
    let tasks = vec![
        sample_task("active-1", TaskStatus::Active, 500_000, 20_000),
        sample_task("active-2", TaskStatus::Active, 750_000, 30_000),
        sample_task("waiting", TaskStatus::Waiting, 5_000_000, 5_000_000),
        sample_task("complete", TaskStatus::Complete, 10_000_000, 10_000_000),
    ];

    let snapshot = aggregate_current_speeds(&tasks);

    assert_eq!(snapshot.download_bps, 1_250_000);
    assert_eq!(snapshot.upload_bps, 50_000);
}

#[test]
fn updates_tray_tooltip_with_aggregated_speeds() {
    let updater = RecordingTooltipUpdater::default();
    let tasks = vec![sample_task("active", TaskStatus::Active, 1_260_000, 12_500)];

    update_tray_tooltip_from_tasks(&updater, &tasks).expect("update tooltip");

    assert_eq!(updater.values(), vec!["D: 1.3 MB/s | U: 12.5 KB/s"]);
}
