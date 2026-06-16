use ferro_lib::commands::protocol::{
    magnet_uri_from_args, MagnetLinkPayload, MAGNET_LINK_OPENED_EVENT,
};

#[test]
fn extracts_magnet_uri_from_cli_args_and_normalizes_scheme_only() {
    let args = vec![
        "ferro.exe".to_string(),
        "MAGNET:?xt=urn:btih:ABCDEF&dn=Ubuntu.ISO".to_string(),
    ];

    assert_eq!(
        magnet_uri_from_args(&args),
        Some("magnet:?xt=urn:btih:ABCDEF&dn=Ubuntu.ISO".to_string())
    );
}

#[test]
fn ignores_non_magnet_cli_args() {
    let args = vec![
        "ferro.exe".to_string(),
        "https://example.com/file.iso".to_string(),
    ];

    assert_eq!(magnet_uri_from_args(&args), None);
}

#[test]
fn serializes_frontend_event_payload() {
    let payload = MagnetLinkPayload {
        url: "magnet:?xt=urn:btih:abcdef".to_string(),
    };

    let value = serde_json::to_value(payload).expect("serialize payload");

    assert_eq!(MAGNET_LINK_OPENED_EVENT, "protocol:magnet-opened");
    assert_eq!(value["url"], "magnet:?xt=urn:btih:abcdef");
}
