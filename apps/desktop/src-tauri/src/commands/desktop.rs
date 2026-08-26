//! Desktop commands: sidecar lifecycle, window controls, dialogs, tray status.

use crate::SidecarHandle;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub struct WindowState {
    pub minimized: bool,
    pub maximized: bool,
    pub focused: bool,
    pub fullscreen: bool,
}

fn window_state(window: &WebviewWindow) -> WindowState {
    WindowState {
        minimized: window.is_minimized().unwrap_or(false),
        maximized: window.is_maximized().unwrap_or(false),
        focused: window.is_focused().unwrap_or(false),
        fullscreen: window.is_fullscreen().unwrap_or(false),
    }
}

/// Spawn (or return the already-running) DSH sidecar; resolves to the web URL.
#[tauri::command]
pub async fn start_sidecar(app: AppHandle, state: State<'_, SidecarHandle>) -> Result<String, String> {
    let handle = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = handle.lock().map_err(|_| "sidecar state poisoned".to_string())?;
        guard.start(&app)
    })
    .await
    .map_err(|error| format!("sidecar task failed: {error}"))?
}

/// Stop the sidecar (the window's WebView keeps the current URL).
#[tauri::command]
pub async fn stop_sidecar(state: State<'_, SidecarHandle>) -> Result<(), String> {
    let handle = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = handle.lock().map_err(|_| "sidecar state poisoned".to_string())?;
        guard.stop()
    })
    .await
    .map_err(|error| format!("sidecar stop task failed: {error}"))?
}

/// Current sidecar status (polled after page reload).
#[tauri::command]
pub fn get_dsh_status(state: State<'_, SidecarHandle>) -> Result<crate::sidecar::DshStatus, String> {
    let guard = state.inner().lock().map_err(|_| "sidecar state poisoned".to_string())?;
    Ok(guard.status())
}

/// Restart the sidecar; resolves to the (new) web URL.
#[tauri::command]
pub async fn restart_sidecar(app: AppHandle, state: State<'_, SidecarHandle>) -> Result<String, String> {
    let handle = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = handle.lock().map_err(|_| "sidecar state poisoned".to_string())?;
        guard.restart(&app)
    })
    .await
    .map_err(|error| format!("sidecar restart task failed: {error}"))?
}

/// Open the native file dialog (multi-select); returns picked paths.
#[tauri::command]
pub fn open_file_dialog(app: AppHandle, _multiple: bool) -> Result<Vec<String>, String> {
    // tauri-plugin-dialog v2: blocking_pick_files always selects multiple
    // files (Android content URIs are resolved on the plugin side).
    let picked = app.dialog().file().blocking_pick_files();
    Ok(picked
        .unwrap_or_default()
        .into_iter()
        .filter_map(|path| path.into_path().map(|path| path.to_string_lossy().into_owned()).ok())
        .collect())
}

// ---- Window controls (custom titlebar) -------------------------------------

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|error| error.to_string())
    } else {
        window.maximize().map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_set_title(window: WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn window_get_state(window: WebviewWindow) -> Result<WindowState, String> {
    Ok(window_state(&window))
}

// ---- Tray passthrough (tray integration lands in Phase 3) -------------------

#[derive(Default)]
pub struct TrayStatusState(Mutex<Option<String>>);

#[tauri::command]
pub fn set_tray_status(
    app: AppHandle,
    status: String,
    detail: Option<String>,
    state: State<'_, TrayStatusState>,
) -> Result<(), String> {
    *state.0.lock().map_err(|_| "tray state poisoned".to_string())? = Some(status.clone());
    let _ = app.emit("tray/status", serde_json::json!({ "status": status, "detail": detail }));
    Ok(())
}

#[tauri::command]
pub fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    let _ = app.emit("tray/title", serde_json::json!({ "title": title }));
    Ok(())
}
