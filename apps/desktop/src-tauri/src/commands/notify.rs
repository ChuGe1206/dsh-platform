//! System notification command (desktop + mobile shell entry points).

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Show a system notification (bridge `/notify` also routes here).
#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
    _sound: bool,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}
