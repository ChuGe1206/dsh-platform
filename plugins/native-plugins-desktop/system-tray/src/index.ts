/**
 * System tray — tray icon + menu hooks for the Tauri desktop shell.
 *
 * The Rust side owns the tray (main.rs ↔ tray.rs) and emits:
 *   `tray/menu` { action: 'show' | 'hide' | 'restart-sidecar' | 'quit' }
 * The WebView mirrors DSH state into the tray via `set_tray_status`.
 * @module @dsh-platform/native-system-tray
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface TrayMenuAction {
  action: 'show' | 'hide' | 'restart-sidecar' | 'quit'
}

export type TrayStatus = 'idle' | 'starting' | 'ready' | 'error'

/** Subscribe to tray menu actions (returns an unlisten function). */
export function onTrayAction(handler: (action: TrayMenuAction) => void): Promise<UnlistenFn> {
  return listen<TrayMenuAction>('tray/menu', (event) => handler(event.payload))
}

/** Mirror DSH state into the tray tooltip/icon (no-op outside Tauri). */
export async function setTrayStatus(status: TrayStatus, detail?: string): Promise<void> {
  try {
    await invoke('set_tray_status', { status, detail: detail ?? null })
  } catch {
    /* tray not configured in this build */
  }
}

export async function setTrayTitle(title: string): Promise<void> {
  try {
    await invoke('set_tray_title', { title })
  } catch {
    /* no-op outside Tauri */
  }
}

export const systemTray = { onTrayAction, setTrayStatus, setTrayTitle }
