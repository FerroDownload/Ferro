use log::{Level, Metadata};
use url::Url;

pub const URI_SENSITIVE_TARGET: &str = "ferro::uri_sensitive";
const REDACTED_URL: &str = "<redacted-url>";

pub fn should_keep_log_record(metadata: &Metadata<'_>) -> bool {
    if !metadata.target().starts_with(URI_SENSITIVE_TARGET) {
        return true;
    }

    matches!(metadata.level(), Level::Debug | Level::Trace)
}

pub fn strip_url_credentials_and_query(value: &str) -> String {
    let Ok(mut parsed) = Url::parse(value.trim()) else {
        return REDACTED_URL.to_string();
    };

    if parsed.cannot_be_a_base() {
        return format!("{}:<redacted>", parsed.scheme());
    }

    if parsed.set_username("").is_err() {
        return REDACTED_URL.to_string();
    }
    if parsed.set_password(None).is_err() {
        return REDACTED_URL.to_string();
    }
    parsed.set_query(None);

    parsed.to_string()
}

#[macro_export]
macro_rules! uri_sensitive {
    ($($arg:tt)+) => {
        log::debug!(target: $crate::services::log_filter::URI_SENSITIVE_TARGET, $($arg)+)
    };
}
