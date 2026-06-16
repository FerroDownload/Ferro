use ferro_lib::engine::aria2_client::{parse_response_for_method, EngineError};

#[test]
fn parse_response_translates_missing_required_fields_to_deserialization_error() {
    let payload = r#"{"jsonrpc":"2.0","id":1,"result":{}}"#;

    let error = parse_response_for_method::<Aria2VersionProbe>("aria2.getVersion", payload)
        .expect_err("missing version should fail at serde boundary");

    assert_eq!(
        error,
        EngineError::DeserializationFailed {
            method: "aria2.getVersion".to_string(),
            payload_preview: payload.to_string(),
        }
    );
}

#[test]
fn parse_response_translates_wrong_field_types_to_deserialization_error() {
    let payload = r#"{"jsonrpc":"2.0","id":1,"result":{"version":42}}"#;

    let error = parse_response_for_method::<Aria2VersionProbe>("aria2.getVersion", payload)
        .expect_err("wrong version type should fail at serde boundary");

    assert_eq!(
        error,
        EngineError::DeserializationFailed {
            method: "aria2.getVersion".to_string(),
            payload_preview: payload.to_string(),
        }
    );
}

#[test]
fn parse_response_deserialization_error_uses_bounded_payload_preview() {
    let payload = format!(
        r#"{{"jsonrpc":"2.0","id":1,"result":{{"version":42,"padding":"{}"}}}}"#,
        "1".repeat(400)
    );

    let error = parse_response_for_method::<Aria2VersionProbe>("aria2.getVersion", &payload)
        .expect_err("wrong version type should fail at serde boundary");

    match error {
        EngineError::DeserializationFailed {
            method,
            payload_preview,
        } => {
            assert_eq!(method, "aria2.getVersion");
            assert!(payload_preview.len() < payload.len());
            assert!(payload_preview.ends_with("..."));
        }
        unexpected => panic!("unexpected error: {unexpected:?}"),
    }
}

#[test]
fn engine_error_serializes_as_structured_command_payload() {
    let error = EngineError::DeserializationFailed {
        method: "aria2.getVersion".to_string(),
        payload_preview: r#"{"result":{}}"#.to_string(),
    };

    let payload = error.to_command_payload();

    assert_eq!(
        payload,
        r#"{"kind":"deserialization_failed","method":"aria2.getVersion","payload_preview":"{\"result\":{}}"}"#
    );
}

#[derive(Debug, serde::Deserialize)]
struct Aria2VersionProbe {
    #[allow(dead_code)]
    version: String,
}
