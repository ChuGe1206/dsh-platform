//! Bridge protocol types shared by all native shells. Field names and enum
//! values must stay in sync with `packages/shared-bridge/src/protocol.ts`
//! (PROTOCOL_VERSION / BridgeRequest / BridgeResponse).

use serde::{Deserialize, Serialize};

/// Wire protocol version; must match PROTOCOL_VERSION in shared-bridge.
pub const PROTOCOL_VERSION: u32 = 1;

/// Bridge methods every native shell implements on `POST /{method}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BridgeMethod {
    Notify,
    Status,
    FileDrop,
    ThemeSync,
    ShortcutTrigger,
    HmsPush,
}

impl BridgeMethod {
    /// Parse a method from its URL/JSON string ("notify", "file-drop", ...).
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "notify" => Some(Self::Notify),
            "status" => Some(Self::Status),
            "file-drop" => Some(Self::FileDrop),
            "theme-sync" => Some(Self::ThemeSync),
            "shortcut-trigger" => Some(Self::ShortcutTrigger),
            "hms-push" => Some(Self::HmsPush),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Notify => "notify",
            Self::Status => "status",
            Self::FileDrop => "file-drop",
            Self::ThemeSync => "theme-sync",
            Self::ShortcutTrigger => "shortcut-trigger",
            Self::HmsPush => "hms-push",
        }
    }
}

/// Inbound request: WebView → native shell.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeRequest {
    pub id: String,
    pub method: BridgeMethod,
    #[serde(default)]
    pub payload: serde_json::Map<String, serde_json::Value>,
}

/// Outbound response: native shell → WebView.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeResponse {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
}

impl BridgeRequest {
    /// Drain a JSON body into a request, or report why it is malformed.
    pub fn parse_body(body: &[u8]) -> Result<Self, BridgeError> {
        let request: Self = serde_json::from_slice(body).map_err(|err| {
            BridgeError::Malformed(format!("invalid bridge request JSON: {err}"))
        })?;
        Ok(request)
    }
}

impl BridgeResponse {
    pub fn ok(id: impl Into<String>, data: Option<serde_json::Value>) -> Self {
        Self { id: id.into(), success: true, data, error: None, version: Some(PROTOCOL_VERSION) }
    }

    pub fn err(id: impl Into<String>, error: impl Into<String>) -> Self {
        Self { id: id.into(), success: false, data: None, error: Some(error.into()), version: Some(PROTOCOL_VERSION) }
    }

    pub fn to_json(&self) -> Result<Vec<u8>, BridgeError> {
        serde_json::to_vec(self).map_err(|err| BridgeError::Encode(err.to_string()))
    }

    pub fn content_type(&self) -> &'static str {
        "application/json"
    }
}

/// Errors surfaced while decoding or encoding bridge frames.
#[derive(Debug)]
pub enum BridgeError {
    Malformed(String),
    Encode(String),
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Malformed(message) => write!(formatter, "malformed bridge frame: {message}"),
            Self::Encode(message) => write!(formatter, "bridge encode error: {message}"),
        }
    }
}

impl std::error::Error for BridgeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn method_roundtrip() {
        assert_eq!(BridgeMethod::parse("file-drop"), Some(BridgeMethod::FileDrop));
        assert_eq!(BridgeMethod::FileDrop.as_str(), "file-drop");
        assert_eq!(BridgeMethod::parse("unknown"), None);
    }

    #[test]
    fn response_roundtrip() {
        let ok = BridgeResponse::ok("r1", Some(serde_json::json!({ "ok": true })));
        let json = ok.to_json().unwrap();
        let parsed: BridgeRequest = serde_json::from_slice(
            br#"{"id":"r1","method":"notify","payload":{"title":"x"}}"#,
        )
        .unwrap();
        assert_eq!(parsed.id, "r1");
        assert!(json.len() > 10);
    }

    #[test]
    fn parse_body_rejects_garbage() {
        assert!(BridgeRequest::parse_body(b"not json").is_err());
    }
}
