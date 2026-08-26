/**
 * hms-push — Huawei Push Kit surface (HarmonyOS NEXT).
 * Native methods (HarmonyBridge.ets): `hms.getToken`, `hms.push`.
 * The DSH `desktop-bridge` plugin routes turn notifications here when
 * `use_hms_push: true`.
 * @module @dsh-platform/native-hms-push
 */
import { callNative } from '@dsh-platform/native-harmony-bridge'
import type { HmsPushPayload } from '@dsh-platform/shared-bridge'

export interface HmsToken {
  token: string
  topic?: string
}

export async function getToken(): Promise<HmsToken | null> {
  const result = await callNative('hms.getToken')
  return result.ok ? (result.data as HmsToken) : null
}

export async function sendPush(payload: HmsPushPayload): Promise<boolean> {
  const result = await callNative('hms.push', payload)
  return result.ok
}

export const hmsPush = { getToken, sendPush }
