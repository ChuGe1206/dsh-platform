//! Mobile native bridge 鈥?mirrors apps/desktop/src-tauri/src/bridge.rs on the
//! device loopback. Kept behind the same wire protocol (shared-bridge).
//! Phase 4 scaffold: file-drop/share/push handlers land with the mobile plugin
//! work; the server itself is functional.

use serde_json::{json, Value};
use shared_rust::bridge::{BridgeMethod, BridgeRequest, BridgeResponse};
use std::thread;
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Request, Response, Server};

pub const BRIDGE_PORT: u16 = 9527;

pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let server = match Server::http(format!("127.0.0.1:{BRIDGE_PORT}")) {
            Ok(server) => server,
            Err(error) => {
                eprintln!("[bridge] cannot bind: {error}");
                return;
            }
        };
        for request in server.incoming_requests() {
            let app = app.clone();
            thread::spawn(move || handle(app, request));
        }
    });
}

fn header(name: &'static [u8], value: &'static [u8]) -> Header {
    Header::from_bytes(name, value).expect("static header is valid")
}

fn handle(app: AppHandle, mut request: Request) {
    fn cors<T: std::io::Read>(response: Response<T>) -> Response<T> {
        response
            .with_header(header(b"Access-Control-Allow-Origin", b"*"))
            .with_header(header(b"Access-Control-Allow-Methods", b"GET, POST, OPTIONS"))
            .with_header(header(b"Access-Control-Allow-Headers", b"Content-Type"))
    }

    if request.method() == &Method::Options {
        let _ = request.respond(cors(Response::empty(204)));
        return;
    }

    let url = request.url().to_string();
    if request.method() == &Method::Get && url == "/" {
        let body = json!({ "name": "dsh-platform-mobile-native", "healthy": true })
            .to_string()
            .into_bytes();
        let _ = request.respond(
            cors(Response::from_data(body)
                .with_header(header(b"Content-Type", b"application/json"))),
        );
        return;
    }

    if request.method() != &Method::Post {
        let _ = request.respond(cors(Response::from_data(b"{\"error\":\"method not allowed\"}".to_vec())));
        return;
    }

    let method = BridgeMethod::parse(url.trim_start_matches('/').split('?').next().unwrap_or(""));
    let Some(method) = method else {
        let _ = request.respond(cors(Response::from_data(b"{\"error\":\"unknown endpoint\"}".to_vec())));
        return;
    };

    let mut body = Vec::new();
    if request.as_reader().read_to_end(&mut body).is_err() {
        let _ = request.respond(cors(Response::from_data(
            serde_json::to_vec(&BridgeResponse::err("", "read body failed")).unwrap_or_default(),
        )));
        return;
    }

    let parsed = match BridgeRequest::parse_body(&body) {
        Ok(parsed) => parsed,
        Err(error) => {
            let _ = request.respond(cors(Response::from_data(
                serde_json::to_vec(&BridgeResponse::err("", error.to_string())).unwrap_or_default(),
            )));
            return;
        }
    };

    let payload = Value::Object(parsed.payload.clone());
    let _ = app.emit(&format!("bridge://{}", method.as_str()), payload);
    let response = serde_json::to_vec(&BridgeResponse::ok(parsed.id, None)).unwrap_or_default();
    let _ = request.respond(cors(Response::from_data(response)));
}
