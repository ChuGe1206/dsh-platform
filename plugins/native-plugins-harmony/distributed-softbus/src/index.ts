/**
 * Distributed softbus — nearby-device discovery and messaging (HarmonyOS).
 * Useful for handing a DSH session to a phone/tablet on the same account.
 * Native methods: `softbus.discover`, `softbus.send`.
 * @module @dsh-platform/native-distributed-softbus
 */
import { callNative, onNativeEvent } from '@dsh-platform/native-harmony-bridge'

export interface NearbyDevice {
  deviceId: string
  name: string
  deviceType: 'phone' | 'tablet' | 'pc' | 'tv' | 'wearable' | 'other'
  online: boolean
}

export async function discover(timeoutMs = 5000): Promise<NearbyDevice[]> {
  const result = await callNative('softbus.discover', { timeoutMs })
  return result.ok ? ((result.data as NearbyDevice[]) ?? []) : []
}

export async function send(message: string, deviceId: string): Promise<boolean> {
  const result = await callNative('softbus.send', { deviceId, message })
  return result.ok
}

export function onMessage(handler: (message: { deviceId: string; text: string }) => void): () => void {
  return onNativeEvent((event) => {
    if (event.type === 'softbus.message') handler(event.payload as { deviceId: string; text: string })
  })
}

export const distributedSoftbus = { discover, send, onMessage }
