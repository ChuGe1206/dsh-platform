//! Global shortcut registration/teardown (tauri-plugin-global-shortcut).

use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShortcutEventPayload {
    id: String,
    shortcut: String,
    pressed_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Register a global shortcut (e.g. "Ctrl+Shift+D"); presses are broadcast as
/// `shortcut-triggered` events carrying the callback id.
#[tauri::command]
pub fn register_global_shortcut(
    app: AppHandle,
    shortcut: String,
    callback_id: String,
) -> Result<(), String> {
    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|error: <Shortcut as std::str::FromStr>::Err| format!("invalid shortcut {shortcut:?}: {error}"))?;

    let callback_label = callback_id.clone();
    let shortcut_label = shortcut.clone();
    app.global_shortcut()
        .on_shortcut(parsed, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app.emit(
                    "shortcut-triggered",
                    ShortcutEventPayload {
                        id: callback_label.clone(),
                        shortcut: shortcut_label.clone(),
                        pressed_at: now_ms(),
                    },
                );
            }
        })
        .map_err(|error| format!("failed to register {shortcut}: {error}"))
}

#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let parsed: Shortcut = shortcut
        .parse()
        .map_err(|error: <Shortcut as std::str::FromStr>::Err| format!("invalid shortcut {shortcut:?}: {error}"))?;
    app.global_shortcut()
        .unregister(parsed)
        .map_err(|error| format!("failed to unregister {shortcut}: {error}"))
}
