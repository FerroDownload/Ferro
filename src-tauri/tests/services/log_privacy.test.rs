use ferro_lib::services::log_filter::{
    should_keep_log_record, strip_url_credentials_and_query, URI_SENSITIVE_TARGET,
};
use log::{Level, MetadataBuilder};

fn metadata(level: Level, target: &'static str) -> log::Metadata<'static> {
    MetadataBuilder::new()
        .level(level)
        .target(target)
        .build()
}

#[test]
fn drops_uri_sensitive_records_above_debug() {
    assert!(!should_keep_log_record(&metadata(
        Level::Info,
        URI_SENSITIVE_TARGET
    )));
    assert!(!should_keep_log_record(&metadata(
        Level::Warn,
        URI_SENSITIVE_TARGET
    )));
    assert!(!should_keep_log_record(&metadata(
        Level::Error,
        URI_SENSITIVE_TARGET
    )));
    assert!(should_keep_log_record(&metadata(
        Level::Debug,
        URI_SENSITIVE_TARGET
    )));
}

#[test]
fn keeps_non_sensitive_records_at_info() {
    assert!(should_keep_log_record(&metadata(Level::Info, "ferro::engine")));
}

#[test]
fn strips_url_credentials_and_query_before_display_or_info_logs() {
    let redacted = strip_url_credentials_and_query(
        "https://user:secret@example.com:8443/releases/file.zip?token=abc#section",
    );

    assert_eq!(
        redacted,
        "https://example.com:8443/releases/file.zip#section"
    );
    assert!(!redacted.contains("user"));
    assert!(!redacted.contains("secret"));
    assert!(!redacted.contains("token"));
}

#[test]
fn returns_redacted_placeholder_for_unparseable_urls() {
    assert_eq!(
        strip_url_credentials_and_query("not a url with C:/Users/Test/Downloads"),
        "<redacted-url>"
    );
}
