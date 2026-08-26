//! dsh-platform mobile shell — remote mode (no sidecar; RemoteClient connects
//! to a desktop DSH web instance; the native bridge on :9527 serves the
//! shared-bridge protocol for push/file-drop/share).

pub mod bridge;

use std::sync::atomic::AtomicU64;

#[derive(Default)]
pub struct BridgeState {
    pub requests_served: AtomicU64,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage::<BridgeState>(BridgeState::default())
        .setup(|app| {
            bridge::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running dsh-platform-mobile");
}
