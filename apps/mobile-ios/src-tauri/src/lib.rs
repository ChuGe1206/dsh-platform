//! dsh-platform iOS shell — remote mode. Native bridge mirrors the Android
//! shell (see apps/mobile-android/src-tauri/src/bridge.rs).

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
        .expect("error while running dsh-platform-mobile-ios");
}

pub mod bridge;
