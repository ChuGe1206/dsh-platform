//! System tray icon & menu (Phase 3.4).
//!
//! Menu: 显示窗口 / 隐藏窗口 / 重启 DSH / 退出。菜单动作同步广播
//! `tray/menu` 事件（payload `{ action }`），前端 `native-system-tray`
//! 包装器直接消费；双击托盘图标重新聚焦主窗口。

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri::menu::{IsMenuItem, Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

pub const TRAY_ID: &str = "dsh-platform-tray";

/// Build the tray icon and its menu (desktop only; called from setup).
pub fn create<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart-sidecar", "重启 DSH", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let items: &[&dyn IsMenuItem<R>] = &[&show, &hide, &restart, &quit];
    let menu = Menu::with_items(app, items)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("dsh-platform — DeepSeek Harness")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => show_window(app),
                "hide" => hide_window(app),
                "restart-sidecar" => {
                    let _ = app.emit("tray/menu", json!({ "action": "restart-sidecar" }));
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::DoubleClick { .. }) {
                show_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn show_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}
