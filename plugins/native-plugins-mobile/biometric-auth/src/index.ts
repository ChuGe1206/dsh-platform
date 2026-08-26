/**
 * Biometric auth — device-lock gating for the mobile shell.
 * Native contract: `biometric_authenticate` (invoke, returns boolean +
 * result message) and `biometric_is_available`.
 * @module @dsh-platform/native-biometric-auth
 */
import { invoke } from '@tauri-apps/api/core'

export interface BiometricResult {
  ok: boolean
  reason?: string
}

export interface BiometricAvailability {
  available: boolean
  // Android: biometric* | deviceCredential | none
  // iOS: faceId | touchId | none
  kind?: string
}

export async function isAvailable(): Promise<BiometricAvailability> {
  try {
    return (await invoke('biometric_is_available')) as BiometricAvailability
  } catch {
    return { available: false }
  }
}

export async function authenticate(reason = '解锁 DSH'): Promise<BiometricResult> {
  try {
    return (await invoke('biometric_authenticate', { reason })) as BiometricResult
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

export const biometricAuth = { isAvailable, authenticate }
