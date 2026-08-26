/**
 * Auto-updater — check/download/install surface for the Tauri desktop shell.
 *
 * The Rust side (commands/updater.rs, planned Phase 3) exposes:
 *   update_check / update_download / update_install / update_events
 * and emits `update/event` { phase, version?, progress? }.
 * @module @dsh-platform/native-auto-updater
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface UpdateInfo {
  available: boolean
  currentVersion: string | null
  latestVersion: string | null
  notes: string | null
  pubDate: string | null
}

export type UpdatePhase = 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'not-available' | 'error'

export interface UpdateEvent {
  phase: UpdatePhase
  version?: string
  progress?: number // 0..1
  error?: string
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  return (await invoke('update_check')) as UpdateInfo
}

export async function downloadUpdate(): Promise<void> {
  await invoke('update_download')
}

export async function installUpdate(): Promise<void> {
  await invoke('update_install')
}

export function onUpdateEvent(handler: (event: UpdateEvent) => void): Promise<UnlistenFn> {
  return listen<UpdateEvent>('update/event', (event) => handler(event.payload))
}

export const autoUpdater = { checkForUpdate, downloadUpdate, installUpdate, onUpdateEvent }
