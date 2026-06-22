use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Map, Value as JsonValue};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

const JSONRPC_VERSION: &str = "2.0";
const TOKEN_PREFIX: &str = "token:";
const PAYLOAD_PREVIEW_MAX_BYTES: usize = 240;
const RPC_REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const RPC_CONNECT_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EngineError {
    Http {
        message: String,
    },
    Rpc {
        code: i64,
        message: String,
    },
    InvalidResponse {
        message: String,
    },
    DeserializationFailed {
        method: String,
        payload_preview: String,
    },
    MissingResult,
}

pub use EngineError as Aria2Error;

impl std::fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::Http { message } => write!(formatter, "aria2 http error: {message}"),
            EngineError::Rpc { code, message } => {
                write!(formatter, "aria2 rpc error {code}: {message}")
            }
            EngineError::InvalidResponse { message } => {
                write!(formatter, "aria2 invalid response: {message}")
            }
            EngineError::DeserializationFailed {
                method,
                payload_preview,
            } => write!(
                formatter,
                "aria2 response deserialization failed for {method}: {payload_preview}"
            ),
            EngineError::MissingResult => write!(formatter, "aria2 response missing result"),
        }
    }
}

impl std::error::Error for EngineError {}

impl EngineError {
    pub fn to_command_payload(&self) -> String {
        match serde_json::to_string(self) {
            Ok(payload) => payload,
            Err(_) => self.to_string(),
        }
    }
}

impl From<reqwest::Error> for EngineError {
    fn from(value: reqwest::Error) -> Self {
        Self::Http {
            message: value.to_string(),
        }
    }
}

#[derive(Debug, Serialize, PartialEq)]
pub struct JsonRpcRequest {
    pub jsonrpc: &'static str,
    pub id: u64,
    pub method: String,
    pub params: Vec<JsonValue>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: u64,
    result: Option<JsonValue>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

#[derive(Debug)]
pub struct Aria2Client {
    http: reqwest::Client,
    endpoint: String,
    secret: Option<String>,
    next_id: AtomicU64,
}

#[derive(Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Aria2Version {
    pub version: String,
    pub enabled_features: Vec<String>,
}

impl Aria2Client {
    pub fn new(host: &str, port: u16, secret: Option<String>) -> Self {
        let endpoint = format!("http://{host}:{port}/jsonrpc");
        let http = reqwest::Client::builder()
            .timeout(RPC_REQUEST_TIMEOUT)
            .connect_timeout(RPC_CONNECT_TIMEOUT)
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            http,
            endpoint,
            secret,
            next_id: AtomicU64::new(1),
        }
    }

    pub async fn call<T: DeserializeOwned>(
        &self,
        method: &str,
        params: Vec<JsonValue>,
    ) -> Result<T, Aria2Error> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = build_request(method, params, self.secret.as_deref(), id);

        let response = self
            .http
            .post(&self.endpoint)
            .json(&request)
            .send()
            .await?
            .error_for_status()?;
        let payload = response.text().await?;
        parse_response_for_method(method, &payload)
    }

    pub async fn change_option(&self, gid: &str, options: JsonValue) -> Result<String, Aria2Error> {
        self.call("aria2.changeOption", vec![json!(gid), options])
            .await
    }

    pub async fn change_global_option(&self, options: JsonValue) -> Result<String, Aria2Error> {
        self.call("aria2.changeGlobalOption", vec![options]).await
    }

    pub async fn get_version(&self) -> Result<Aria2Version, Aria2Error> {
        self.call("aria2.getVersion", vec![]).await
    }
}

pub fn build_request(
    method: &str,
    mut params: Vec<JsonValue>,
    secret: Option<&str>,
    id: u64,
) -> JsonRpcRequest {
    if let Some(secret) = secret {
        // Ref: https://aria2.github.io/manual/en/html/aria2c.html (RPC authorization secret token)
        params.insert(0, JsonValue::String(format!("{TOKEN_PREFIX}{secret}")));
    }

    JsonRpcRequest {
        jsonrpc: JSONRPC_VERSION,
        id,
        method: method.to_string(),
        params,
    }
}

pub fn parse_response<T: DeserializeOwned>(payload: &str) -> Result<T, Aria2Error> {
    parse_response_for_method("unknown", payload)
}

pub fn parse_response_for_method<T: DeserializeOwned>(
    method: &str,
    payload: &str,
) -> Result<T, EngineError> {
    // Ref: https://aria2.github.io/manual/en/html/aria2c.html (RPC error handling)
    let response: JsonRpcEnvelope =
        serde_json::from_str(payload).map_err(|error| EngineError::InvalidResponse {
            message: error.to_string(),
        })?;

    if let Some(error) = response.error {
        return Err(EngineError::Rpc {
            code: error.code,
            message: error.message,
        });
    }

    let result = response.result.ok_or(EngineError::MissingResult)?;
    serde_json::from_value(result).map_err(|_| EngineError::DeserializationFailed {
        method: method.to_string(),
        payload_preview: payload_preview(payload),
    })
}

fn payload_preview(payload: &str) -> String {
    if payload.len() <= PAYLOAD_PREVIEW_MAX_BYTES {
        return payload.to_string();
    }

    let mut end = PAYLOAD_PREVIEW_MAX_BYTES;
    while !payload.is_char_boundary(end) {
        end -= 1;
    }

    format!("{}...", &payload[..end])
}

pub fn build_options_map(options: Vec<(&str, JsonValue)>) -> JsonValue {
    let mut map = Map::new();
    for (key, value) in options {
        map.insert(key.to_string(), value);
    }
    JsonValue::Object(map)
}
