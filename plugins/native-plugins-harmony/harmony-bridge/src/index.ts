/**
 * HarmonyBridge — JS side of the ArkWeb ↔ native bridge.
 *
 * Contracts with `entry/src/main/ets/bridge/HarmonyBridge.ets`:
 *  - native injects `window.harmonyBridge` via javaScriptProxy:
 *      window.harmonyBridge.call(method: string, params: string): Promise<string>
 *  - native pushes events through `window.harmonyBridge.onEvent(cb)` or a
 *    plain `postMessage` channel (`harmony/event`).
 * All calls fall back to the shared-bridge HTTP client when the proxy is
 * absent (dev preview in a desktop browser).
 * @module @dsh-platform/native-harmony-bridge
 */
import { BridgeClient } from '@dsh-platform/shared-bridge'

export interface HarmonyProxy {
  call(method: string, params: string): Promise<string>
  onEvent?(listener: (event: string) => void): void
}

declare global {
  interface Window {
    harmonyBridge?: HarmonyProxy
  }
}

export type HarmonyMethod =
  | 'hms.getToken'
  | 'hms.push'
  | 'file.pick'
  | 'file.save'
  | 'notify.show'
  | 'softbus.discover'
  | 'softbus.send'
  | 'settings.get'
  | 'settings.set'

export interface HarmonyCallResult {
  ok: boolean
  data?: unknown
  error?: string
}

function proxy(): HarmonyProxy | null {
  return typeof window !== 'undefined' ? (window.harmonyBridge ?? null) : null
}

/** Call a native (ArkTS) capability through the forced bridge. */
export async function callNative(method: HarmonyMethod, params: unknown = {}): Promise<HarmonyCallResult> {
  const native = proxy()
  if (native) {
    try {
      const raw = await native.call(method, JSON.stringify(params))
      return JSON.parse(raw) as HarmonyCallResult
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  // Fallback: dev preview — bridge HTTP server (native endpoint).
  const client = new BridgeClient({ platform: 'harmony' })
  const fallbackMethod = bridgeMethodFor(method)
  if (!fallbackMethod) return { ok: false, error: `harmony bridge unavailable (no proxy, no HTTP fallback for ${method})` }
  const response = await client.request(fallbackMethod, params as Record<string, any>)
  if (!response) return { ok: false, error: 'harmony bridge unavailable (no proxy, no native server)' }
  return { ok: response.success, data: response.data, error: response.error }
}

function bridgeMethodFor(method: HarmonyMethod): import('@dsh-platform/shared-bridge').BridgeMethod | null {
  switch (method) {
    case 'hms.push':
      return 'hms-push'
    case 'notify.show':
      return 'notify'
    case 'file.pick':
      return 'file-drop'
    default:
      return null
  }
}

/** Subscribe to native-pushed events (push taps, softbus messages, etc.). */
export function onNativeEvent(listener: (event: { type: string; payload?: unknown }) => void): () => void {
  const native = proxy()
  if (native?.onEvent) {
    native.onEvent((raw) => {
      try {
        listener(JSON.parse(raw) as { type: string; payload?: unknown })
      } catch {
        listener({ type: raw })
      }
    })
  }
  if (typeof window !== 'undefined') {
    const handler = (event: MessageEvent) => {
      try {
        listener(JSON.parse(String(event.data)) as { type: string; payload?: unknown })
      } catch {
        /* not ours */
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }
  return () => {}
}

export const harmonyBridge = { callNative, onNativeEvent }
