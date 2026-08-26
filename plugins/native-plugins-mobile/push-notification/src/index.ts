/**
 * Push notification — mobile shell push surface.
 *
 * Contract (native side, Tauri Mobile plugin or HMS Push bridge):
 *   `push_request_permission` / `push_get_token` (invoke)
 *   `push/display` event  — a local notification was tapped
 *   `push/token` event    — new push token arrived
 * Desktop/harmony shells reuse the same API through their bridge server.
 * @module @dsh-platform/native-push-notification
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { BridgeClient, type HmsPushPayload } from '@dsh-platform/shared-bridge'

export interface PushToken {
  platform: 'android' | 'ios' | 'harmony'
  token: string
  service?: string
}

export interface PushTapEvent {
  title: string
  body: string
  payload?: Record<string, unknown>
}

export async function requestPermission(): Promise<boolean> {
  try {
    return (await invoke('push_request_permission')) as boolean
  } catch {
    return false
  }
}

export async function getToken(): Promise<PushToken | null> {
  try {
    return (await invoke('push_get_token')) as PushToken | null
  } catch {
    return null
  }
}

export function onToken(handler: (token: PushToken) => void): Promise<UnlistenFn> {
  return listen<PushToken>('push/token', (event) => handler(event.payload))
}

export function onTap(handler: (tap: PushTapEvent) => void): Promise<UnlistenFn> {
  return listen<PushTapEvent>('push/display', (event) => handler(event.payload))
}

/** Send a push through the shell's bridge (harmony: /hms-push endpoint). */
export async function pushNotify(payload: HmsPushPayload, bridge?: BridgeClient): Promise<void> {
  if (bridge) await bridge.hmsPush(payload)
  else await invoke('push_send', { payload })
}

export const pushNotification = { requestPermission, getToken, onToken, onTap, pushNotify }
