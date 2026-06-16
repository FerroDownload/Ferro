use std::path::Path;
use std::time::{Duration, SystemTime};

pub const LOG_RETENTION_DAYS: u64 = 30;
const SECONDS_PER_DAY: u64 = 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LogCleanupSummary {
    pub deleted_files: usize,
}

pub fn cleanup_old_log_files(
    log_dir: impl AsRef<Path>,
    now: SystemTime,
) -> std::io::Result<LogCleanupSummary> {
    let log_dir = log_dir.as_ref();
    if !log_dir.exists() {
        return Ok(LogCleanupSummary { deleted_files: 0 });
    }

    let retention = Duration::from_secs(LOG_RETENTION_DAYS * SECONDS_PER_DAY);
    let mut deleted_files = 0;

    for entry in std::fs::read_dir(log_dir)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if !metadata.is_file() {
            continue;
        }

        let modified_at = metadata.modified()?;
        let age = now.duration_since(modified_at).unwrap_or_default();
        if age <= retention {
            continue;
        }

        std::fs::remove_file(entry.path())?;
        deleted_files += 1;
    }

    Ok(LogCleanupSummary { deleted_files })
}
