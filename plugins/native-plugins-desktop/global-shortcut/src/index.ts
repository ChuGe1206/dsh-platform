/**
 * Global shortcut — registers OS-wide hotkeys through the Tauri shell.
 *
 * Handlers are delivered to the WebView via the `shortcut-triggered` event
 * (payload: { id, shortcut, pressedAt }); the DSH desktop-bridge plugin
 * forwards them to the native server as `shortcut-trigger`.
 * @module @dsh-platform/native-global-shortcut
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface ShortcutEvent {
  id: string
  shortcut: string
  pressedAt: number
}

const registry = new Map<string, string>() // callbackId -> shortcut
const pendingUnlisten = new Map<string, () => void>()

/** Register one hotkey (e.g. "Ctrl+Shift+D"); returns a listener id. */
export async function registerShortcut(shortcut: string, onPressed?: (event: ShortcutEvent) => void): Promise<string> {
  const id = crypto.randomUUID()
  await invoke('register_global_shortcut', { shortcut, callbackId: id })
  registry.set(id, shortcut)
  if (onPressed) {
    let unlisten: UnlistenFn | null = null
    unlisten = await listen<ShortcutEvent>('shortcut-triggered', (event) => {
      if (event.payload.id === id) onPressed(event.payload)
    })
    pendingUnlisten.set(id, () => unlisten?.())
  }
  return id
}

/** Unregister a hotkey by its callback id. */
export async function unregisterShortcut(id: string): Promise<void> {
  const shortcut = registry.get(id)
  if (shortcut) {
    await invoke('unregister_global_shortcut', { shortcut }).catch(() => undefined)
    registry.delete(id)
  }
  pendingUnlisten.get(id)?.()
  pendingUnlisten.delete(id)
}

export async function listShortcuts(): Promise<string[]> {
  try {
    return (await invoke('list_global_shortcuts')) as string[]
  } catch {
    return [...registry.values()]
  }
}

export const globalShortcut = { registerShortcut, unregisterShortcut, listShortcuts }
