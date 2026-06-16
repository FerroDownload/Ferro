use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::state::models::FileCollisionBehavior;

pub const COLLISION_NOTICE_EVENT: &str = "download:collision_notice";
const SKIPPED_SINGLE_FILE_MESSAGE: &str = "File already exists; skipped creating the download.";
const BLOCKED_MULTI_FILE_MESSAGE: &str =
    "A selected file already exists; multi-file downloads with collisions are blocked in this version.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CollisionNoticeKind {
    SkippedSingleFile,
    BlockedMultiFile,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CollisionResolution {
    UsePath(PathBuf),
    Blocked {
        kind: CollisionNoticeKind,
        path: PathBuf,
        message: String,
    },
}

pub fn normalize_destination_dir(destination: &str, fallback: &str) -> Result<String, String> {
    let trimmed = destination.trim();
    if !trimmed.is_empty() {
        return Ok(trimmed.to_string());
    }

    let fallback_trimmed = fallback.trim();
    if fallback_trimmed.is_empty() {
        return Err("destination directory is required".to_string());
    }

    Ok(fallback_trimmed.to_string())
}

fn suffix_name(stem: &str, suffix: usize, extension: Option<&str>) -> String {
    if let Some(ext) = extension {
        format!("{stem}({suffix}).{ext}")
    } else {
        format!("{stem}({suffix})")
    }
}

pub fn resolve_collision_path(path: &Path, behavior: FileCollisionBehavior) -> PathBuf {
    if behavior != FileCollisionBehavior::Rename || !path.exists() {
        return path.to_path_buf();
    }

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    let extension = path.extension().and_then(|value| value.to_str());
    let parent = path.parent().unwrap_or_else(|| Path::new(""));

    for index in 1..=9999 {
        let candidate = parent.join(suffix_name(stem, index, extension));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(suffix_name(stem, 9999, extension))
}

fn path_key(path: &Path) -> String {
    let key = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        key.to_ascii_lowercase()
    } else {
        key
    }
}

fn is_reserved(path: &Path, reserved: &HashSet<String>) -> bool {
    reserved.contains(&path_key(path))
}

fn suffixed_path(path: &Path, suffix: usize) -> PathBuf {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    let extension = path.extension().and_then(|value| value.to_str());
    let parent = path.parent().unwrap_or_else(|| Path::new(""));

    parent.join(suffix_name(stem, suffix, extension))
}

pub fn prepare_single_file_destination(
    path: &Path,
    behavior: FileCollisionBehavior,
) -> Result<CollisionResolution, String> {
    prepare_single_file_destination_with_reserved_paths(path, behavior, &[])
}

pub fn prepare_single_file_destination_with_reserved_paths(
    path: &Path,
    behavior: FileCollisionBehavior,
    reserved_paths: &[PathBuf],
) -> Result<CollisionResolution, String> {
    let reserved = reserved_paths.iter().map(|path| path_key(path)).collect();
    prepare_single_file_destination_with_reserved_set(path, behavior, &reserved)
}

fn prepare_single_file_destination_with_reserved_set(
    path: &Path,
    behavior: FileCollisionBehavior,
    reserved: &HashSet<String>,
) -> Result<CollisionResolution, String> {
    if behavior == FileCollisionBehavior::Skip && (path.exists() || is_reserved(path, reserved)) {
        return Ok(CollisionResolution::Blocked {
            kind: CollisionNoticeKind::SkippedSingleFile,
            path: path.to_path_buf(),
            message: SKIPPED_SINGLE_FILE_MESSAGE.to_string(),
        });
    }

    if behavior == FileCollisionBehavior::Overwrite && !is_reserved(path, reserved) {
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        return Ok(CollisionResolution::UsePath(path.to_path_buf()));
    }

    if !path.exists() && !is_reserved(path, reserved) {
        return Ok(CollisionResolution::UsePath(path.to_path_buf()));
    }

    for index in 1..=9999 {
        let candidate = suffixed_path(path, index);
        if is_reserved(&candidate, reserved) {
            continue;
        }
        if candidate.exists() {
            if behavior == FileCollisionBehavior::Rename {
                continue;
            }
            std::fs::remove_file(&candidate).map_err(|error| error.to_string())?;
        }

        return Ok(CollisionResolution::UsePath(candidate));
    }

    Err("unable to find an available download filename".to_string())
}

pub fn validate_multifile_destination(
    output_paths: &[PathBuf],
    _behavior: FileCollisionBehavior,
) -> Option<CollisionResolution> {
    output_paths
        .iter()
        .find(|path| path.exists())
        .map(|path| CollisionResolution::Blocked {
            kind: CollisionNoticeKind::BlockedMultiFile,
            path: path.to_path_buf(),
            message: BLOCKED_MULTI_FILE_MESSAGE.to_string(),
        })
}

pub fn collision_message(resolution: &CollisionResolution) -> Option<&str> {
    match resolution {
        CollisionResolution::UsePath(_) => None,
        CollisionResolution::Blocked { message, .. } => Some(message),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_destination_dir;

    #[test]
    fn uses_explicit_destination_when_provided() {
        let resolved =
            normalize_destination_dir("C:/Downloads", "C:/Fallback").expect("destination");

        assert_eq!(resolved, "C:/Downloads");
    }

    #[test]
    fn falls_back_to_default_download_directory() {
        let resolved =
            normalize_destination_dir("", "C:/Users/Test/Downloads").expect("destination");

        assert_eq!(resolved, "C:/Users/Test/Downloads");
    }

    #[test]
    fn rejects_empty_destination_when_no_fallback_exists() {
        let error =
            normalize_destination_dir(" ", " ").expect_err("missing destination should fail");

        assert_eq!(error, "destination directory is required");
    }
}
