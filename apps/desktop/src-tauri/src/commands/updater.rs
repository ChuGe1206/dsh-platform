//! Auto-updater command stubs (Phase 3.4).
//!
//! The frontend `@dsh-platform/native-auto-updater` wrapper drives
//! `update_check` / `update_download` / `update_install`; until
//! `tauri-plugin-updater` is configured with a signing key and an endpoint,
//! these answer "no update available" so the UI stays honest. The real
//! implementation wires the plugin in `lib.rs` and emits `update/event`.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub notes: Option<String>,
    pub pub_date: Option<String>,
}

#[tauri::command]
pub fn update_check() -> Result<UpdateInfo, String> {
    Ok(UpdateInfo {
        available: false,
        current_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        latest_version: None,
        notes: None,
        pub_date: None,
    })
}

#[tauri::command]
pub fn update_download() -> Result<(), String> {
    Err("auto-updater is not configured (tauri-plugin-updater endpoint/signing key missing)".into())
}

#[tauri::command]
pub fn update_install() -> Result<(), String> {
    Err("auto-updater is not configured; nothing to install".into())
}
