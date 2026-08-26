//! Desktop commands: sidecar lifecycle, window controls, dialogs, tray status.

use crate::SidecarHandle;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
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

/// 在线安装 DSH 运行时（发布形态首次引导）。
///
/// 安装包保持轻薄（壳 + 协议），DSH Node 依赖在首次启动时安装到
/// `<app_data_dir>/runtime`（`npm install @deepseek-ai/dsh@<version>`，
/// `--prefix` 目标目录 + `--omit=dev`）。成功校验 `lib/bin.js` 存在。
/// 需要机器上有 Node.js（npm）；无 Node 环境时提示安装。
#[tauri::command]
pub async fn install_runtime(app: AppHandle, version: Option<String>) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| format!("app data dir: {e}"))?;
    let runtime_dir = data_dir.join("runtime");
    std::fs::create_dir_all(&runtime_dir).map_err(|e| format!("create runtime dir: {e}"))?;

    let npm_checked = std::env::var("DSH_PLATFORM_NPM")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "npm".to_string());
    // 与仓库依赖一致的 DSH CLI 版本（见 HARNESS_UPSTREAM.md / 根 package.json）
    let spec = version.unwrap_or_else(|| "0.1.1-rc.2".to_string());

    let npm_args = [
        "install".to_string(),
        format!("@deepseek-ai/dsh@{spec}"),
        "--prefix".to_string(),
        runtime_dir.to_string_lossy().into_owned(),
        "--omit=dev".to_string(),
        "--no-audit".to_string(),
        "--no-fund".to_string(),
    ];

    let output = std::process::Command::new(&npm_checked)
        .args(&npm_args)
        .env("npm_config_yes", "true")
        .output()
        .map_err(|err| format!("failed to run `{npm_checked}` (需要本机已安装 Node.js): {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "runtime 安装失败（npm 退出 {}）: {}",
            output.status,
            stderr.lines().last().unwrap_or("")
        ));
    }

    let bin = runtime_dir
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js");
    if !bin.exists() {
        return Err(format!("npm 成功但未找到 DSH CLI: {}", bin.display()));
    }
    Ok(())
}

/// 当前运行时状态（前端引导 UI 用）。
#[tauri::command]
pub fn runtime_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bin = data_dir
        .join("runtime")
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh")
        .join("lib")
        .join("bin.js");
    Ok(serde_json::json!({
        "dshRuntimeInstalled": bin.exists(),
        "runtimeDir": data_dir.join("runtime").to_string_lossy(),
    }))
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
