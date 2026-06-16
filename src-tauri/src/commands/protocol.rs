use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

pub const MAGNET_LINK_OPENED_EVENT: &str = "protocol:magnet-opened";

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct MagnetLinkPayload {
    pub url: String,
}

pub fn magnet_uri_from_args(args: &[String]) -> Option<String> {
    args.iter().find_map(|arg| normalize_magnet_uri(arg))
}

pub fn emit_magnet_uri_from_args<R: Runtime>(
    app: &AppHandle<R>,
    args: &[String],
) -> tauri::Result<()> {
    if let Some(url) = magnet_uri_from_args(args) {
        emit_magnet_uri(app, url)
    } else {
        Ok(())
    }
}

pub fn emit_magnet_uri<R: Runtime>(app: &AppHandle<R>, url: String) -> tauri::Result<()> {
    app.emit(MAGNET_LINK_OPENED_EVENT, MagnetLinkPayload { url })
}

fn normalize_magnet_uri(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let (_, rest) = trimmed.split_once(':')?;
    let parsed = url::Url::parse(trimmed).ok()?;

    if parsed.scheme().eq_ignore_ascii_case("magnet") {
        Some(format!("magnet:{rest}"))
    } else {
        None
    }
}
