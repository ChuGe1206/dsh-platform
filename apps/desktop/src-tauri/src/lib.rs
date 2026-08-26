//! dsh-platform desktop shell — Tauri builder wiring.
//!
//! Startup sequence (desktop):
//!   1. Rust spawns the DSH sidecar (node `harness/apps/cli/lib/bin.js web`)
//!   2. DSH prints the ready line `dsh web: http://127.0.0.1:<PORT>`
//!   3. Rust parses/validates the port and answers `start_sidecar`
//!   4. The WebView loads `http://127.0.0.1:<PORT>` into the iframe
//!   5. The desktop-bridge plugin reaches the native bridge on :9527

pub mod bridge;
pub mod commands;
pub mod sidecar;
pub mod version;
#[cfg(desktop)]
pub mod tray;

use std::sync::{Arc, Mutex};
use tauri::Manager;

pub type SidecarHandle = Arc<Mutex<sidecar::DSHSidecar>>;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage::<SidecarHandle>(Arc::new(Mutex::new(sidecar::DSHSidecar::new())))
        .manage::<bridge::BridgeState>(bridge::BridgeState::default())
        .manage::<commands::desktop::TrayStatusState>(commands::desktop::TrayStatusState::default())
        .invoke_handler(tauri::generate_handler![
            commands::desktop::start_sidecar,
            commands::desktop::stop_sidecar,
            commands::desktop::get_dsh_status,
            commands::desktop::restart_sidecar,
            commands::desktop::install_runtime,
            commands::desktop::runtime_status,
            commands::desktop::open_file_dialog,
            commands::desktop::window_minimize,
            commands::desktop::window_toggle_maximize,
            commands::desktop::window_close,
            commands::desktop::window_set_title,
            commands::desktop::window_get_state,
            commands::desktop::set_tray_status,
            commands::desktop::set_tray_title,
            commands::notify::show_notification,
            commands::shortcut::register_global_shortcut,
            commands::shortcut::unregister_global_shortcut,
            commands::updater::update_check,
            commands::updater::update_download,
            commands::updater::update_install,
        ])
        .setup(|app| {
            bridge::spawn(app.handle().clone());

            // 预启动 sidecar：不等前端 WebView 加载完成，Rust 层立即并行拉起
            // DSH —— start_sidecar 命令幂等（已启动则直接返回 URL），
            // 前端挂载后即刻拿到就绪地址（启动体验优化，见 docs/PERFORMANCE.md）。
            {
                let handle = app.state::<SidecarHandle>().inner().clone();
                let app_handle = app.handle().clone();
                #[cfg(desktop)]
                std::thread::spawn(move || {
                    let mut guard = match handle.lock() {
                        Ok(guard) => guard,
                        Err(poisoned) => poisoned.into_inner(),
                    };
                    if !guard.is_running() {
                        if let Err(error) = guard.start(&app_handle) {
                            eprintln!("[sidecar] 预启动失败: {error}");
                        }
                    }
                });
            }

            #[cfg(desktop)]
            tray::create(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running dsh-platform");
}
