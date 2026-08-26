/**
 * Window manager — custom-titlebar controls for the Tauri desktop shell.
 * Falls back to no-ops when not running inside Tauri (dev preview in a
 * plain browser).
 * @module @dsh-platform/native-window-manager
 */
import { invoke } from '@tauri-apps/api/core'

export interface WindowState {
  minimized: boolean
  maximized: boolean
  focused: boolean
  fullscreen?: boolean
}

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function minimize(): Promise<void> {
  if (inTauri()) await invoke('window_minimize')
}

export async function toggleMaximize(): Promise<void> {
  if (inTauri()) await invoke('window_toggle_maximize')
}

export async function closeWindow(): Promise<void> {
  if (inTauri()) await invoke('window_close')
}

export async function setTitle(title: string): Promise<void> {
  if (inTauri()) await invoke('window_set_title', { title })
}

export async function getState(): Promise<WindowState | null> {
  if (!inTauri()) return null
  return (await invoke('window_get_state')) as WindowState
}

export const windowManager = { minimize, toggleMaximize, closeWindow, setTitle, getState }
