use tauri::{AppHandle, Runtime};

use crate::state::models::{Task, TaskStatus};
use crate::tray::{format_tray_tooltip, set_tray_tooltip};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpeedSnapshot {
    pub download_bps: i64,
    pub upload_bps: i64,
}

pub trait TrayTooltipUpdater {
    fn set_tooltip(&self, tooltip: String) -> Result<(), String>;
}

#[derive(Clone)]
pub struct TauriTrayTooltipUpdater<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriTrayTooltipUpdater<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> TrayTooltipUpdater for TauriTrayTooltipUpdater<R> {
    fn set_tooltip(&self, tooltip: String) -> Result<(), String> {
        set_tray_tooltip(&self.app, tooltip)
    }
}

pub fn aggregate_current_speeds(tasks: &[Task]) -> SpeedSnapshot {
    tasks
        .iter()
        .filter(|task| task.status == TaskStatus::Active)
        .fold(
            SpeedSnapshot {
                download_bps: 0,
                upload_bps: 0,
            },
            |snapshot, task| SpeedSnapshot {
                download_bps: snapshot.download_bps + task.download_speed_bps.max(0),
                upload_bps: snapshot.upload_bps + task.upload_speed_bps.max(0),
            },
        )
}

pub fn update_tray_tooltip_from_tasks<U>(updater: &U, tasks: &[Task]) -> Result<(), String>
where
    U: TrayTooltipUpdater,
{
    let snapshot = aggregate_current_speeds(tasks);
    updater.set_tooltip(format_tray_tooltip(
        snapshot.download_bps,
        snapshot.upload_bps,
    ))
}
