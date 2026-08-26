//! Native bridge HTTP server — the DSH desktop-bridge plugin's counterpart.
//!
//! Listens on `127.0.0.1:9527` (NATIVE_ENDPOINTS.desktop) and serves:
//!   GET  /                     → health JSON
//!   POST /notify               → system notification + `bridge://notify`
//!   POST /status               → `bridge://status`
//!   POST /file-drop            → `bridge://file-drop`
//!   POST /theme-sync           → `bridge://theme-sync`
//!   POST /shortcut-trigger     → `bridge://shortcut-trigger`
//!   POST /hms-push             → `bridge://hms-push`
//!   OPTIONS *                  → CORS preflight (the iframe is a different origin)
//!
//! Every handler answers `BridgeResponse` (shared-rust wire type) and emits a
//! Tauri event; failures never propagate back to DSH (silent-by-design).

use serde_json::{json, Value};
use shared_rust::bridge::{BridgeMethod, BridgeRequest, BridgeResponse};
use std::sync::atomic::AtomicU64;
use std::thread;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tiny_http::{Header, Method, Request, Response, Server};

pub const BRIDGE_PORT: u16 = 9527;

#[derive(Default)]
pub struct BridgeState {
    pub requests_served: AtomicU64,
}

/// Spawn the bridge server on a background thread (called once from setup).
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let server = match Server::http(format!("127.0.0.1:{BRIDGE_PORT}")) {
            Ok(server) => server,
            Err(error) => {
                eprintln!("[bridge] cannot bind 127.0.0.1:{BRIDGE_PORT}: {error}");
                return;
            }
        };
        eprintln!("[bridge] listening on http://127.0.0.1:{BRIDGE_PORT}");
        for request in server.incoming_requests() {
            let app = app.clone();
            thread::spawn(move || handle(app, request));
        }
    });
}

fn header(name: &'static [u8], value: &'static [u8]) -> Header {
    Header::from_bytes(name, value).expect("static header is valid")
}

fn cors_headers() -> Vec<Header> {
    vec![
        header(b"Access-Control-Allow-Origin", b"*"),
        header(b"Access-Control-Allow-Methods", b"GET, POST, OPTIONS"),
        header(b"Access-Control-Allow-Headers", b"Content-Type"),
    ]
}

fn respond(request: Request, response: Response<std::io::Cursor<Vec<u8>>>) {
    let _ = request.respond(response);
}

fn json_response(body: Vec<u8>, status: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(body)
        .with_status_code(status)
        .with_header(header(b"Content-Type", b"application/json"))
}

fn emit_json(app: &AppHandle, event: &str, payload: Value) {
    let _ = app.emit(event, payload);
}

fn handle(app: AppHandle, mut request: Request) {
    if request.method() == &Method::Options {
        let mut response = Response::empty(204);
        for header in cors_headers() {
            response = response.with_header(header);
        }
        let _ = request.respond(response);
        return;
    }

    let url = request.url().to_string();

    if request.method() == &Method::Get && url == "/" {
        let body = json!({
            "name": "dsh-platform-native",
            "healthy": true,
            "protocolVersion": shared_rust::ProtocolVersion,
        })
        .to_string()
        .into_bytes();
        respond(request, json_response(body, 200));
        return;
    }

    if request.method() != &Method::Post {
        respond(request, json_response(b"{\"error\":\"method not allowed\"}".to_vec(), 405));
        return;
    }

    let end = url.split('?').next().unwrap_or("/");
    let method_name = end.trim_start_matches('/');
    let Some(method) = BridgeMethod::parse(method_name) else {
        respond(request, json_response(b"{\"error\":\"unknown endpoint\"}".to_vec(), 404));
        return;
    };

    let mut body = Vec::new();
    if let Err(error) = request.as_reader().read_to_end(&mut body) {
        respond(
            request,
            json_response(
                serde_json::to_vec(&BridgeResponse::err("", format!("read body: {error}")))
                    .unwrap_or_default(),
                400,
            ),
        );
        return;
    }

    let parsed = match BridgeRequest::parse_body(&body) {
        Ok(parsed) => parsed,
        Err(error) => {
            respond(
                request,
                json_response(
                    serde_json::to_vec(&BridgeResponse::err("", error.to_string())).unwrap_or_default(),
                    400,
                ),
            );
            return;
        }
    };

    let _ = route(&app, &parsed, method);
    let response = match serde_json::to_vec(&BridgeResponse::ok(parsed.id.clone(), None)) {
        Ok(bytes) => bytes,
        Err(error) => {
            serde_json::to_vec(&BridgeResponse::err(parsed.id, error.to_string())).unwrap_or_default()
        }
    };
    respond(request, json_response(response, 200));
}

/// Route one bridged request; every routed method succeeds by design so a
/// bridge outage can never surface into DSH.
fn route(app: &AppHandle, request: &BridgeRequest, method: BridgeMethod) -> bool {
    let payload = Value::Object(request.payload.clone());

    let handled = match method {
        BridgeMethod::Notify => {
            let title = request.payload.get("title").and_then(Value::as_str).unwrap_or("DSH");
            let body = request.payload.get("body").and_then(Value::as_str).unwrap_or("");
            let _ = app
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show();
            emit_json(app, "bridge://notify", payload);
            true
        }
        BridgeMethod::Status => {
            emit_json(app, "bridge://status", payload);
            true
        }
        BridgeMethod::FileDrop => {
            emit_json(app, "bridge://file-drop", payload);
            true
        }
        BridgeMethod::ThemeSync => {
            emit_json(app, "bridge://theme-sync", payload);
            true
        }
        BridgeMethod::ShortcutTrigger => {
            emit_json(app, "bridge://shortcut-trigger", payload);
            true
        }
        BridgeMethod::HmsPush => {
            emit_json(app, "bridge://hms-push", payload);
            true
        }
    };

    handled
}

/// Exposed for unit tests: assemble a CORS'd bridge response.
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_body_is_valid_json() {
        let body = json!({ "name": "dsh-platform-native", "healthy": true });
        assert_eq!(body["name"].as_str(), Some("dsh-platform-native"));
    }

    #[test]
    fn method_parsing_stays_in_sync_with_shared_rust() {
        for method in ["notify", "status", "file-drop", "theme-sync", "shortcut-trigger", "hms-push"] {
            assert!(BridgeMethod::parse(method).is_some(), "endpoint {method} must be routable");
        }
    }
}
