/**
 * The dsh-platform wire protocol.
 *
 * Three layers:
 *  1. DSH events (`DSHEvent`) — flow from DSH (via plugins) to the shell.
 *  2. Bridge requests (`BridgeRequest`) — shell ⇄ WebView HTTP POST exchange
 *     against the native server (Tauri: 127.0.0.1:9527; mobile/harmony: same
 *     loopback or a local NAT port).
 *  3. Bridge responses (`BridgeResponse`) — reply envelopes with id
 *     correlation so either side may fire-and-forget or await.
 *
 * @module @dsh-platform/shared-bridge/protocol
 */
import type { Session, SessionEvent, Turn } from './types'

/** Protocol version; native shells reject mismatched majors with `version-mismatch`. */
export const PROTOCOL_VERSION = 1
export const PROTOCOL_MAJOR = 1

export type DSHEventType =
  | 'session/start'
  | 'session/event'
  | 'turn/start'
  | 'turn/end'
  | 'agent/error'
  | 'web/client/slot'

/** Events flowing out of DSH through a bridging plugin. */
export interface DSHEvent {
  type: DSHEventType
  payload: Record<string, any>
  timestamp: number
  sessionId?: string
}

export type BridgeMethod =
  | 'notify'
  | 'status'
  | 'file-drop'
  | 'theme-sync'
  | 'shortcut-trigger'
  | 'hms-push'

/** Every native shell implements these endpoints on its local HTTP server. */
export const BRIDGE_METHODS: readonly BridgeMethod[] = [
  'notify',
  'status',
  'file-drop',
  'theme-sync',
  'shortcut-trigger',
  'hms-push'
] as const

/** Request envelope: WebView → native server. */
export interface BridgeRequest {
  id: string
  method: BridgeMethod
  payload: Record<string, any>
}

/** Response envelope: native server → WebView. */
export interface BridgeResponse {
  id: string
  success: boolean
  data?: any
  error?: string
  /** Echoed protocol version; mismatch ⇒ caller should downgrade. */
  version?: number
}

export interface NotifyPayload {
  title: string
  body: string
  sound?: boolean
  /** URL opened when the user clicks the notification (desktop only). */
  actionUrl?: string
}

export interface StatusPayload {
  activeSessions: number
  timestamp: number
  extra?: Record<string, unknown>
}

export interface FileDropPayload {
  /** Absolute paths, or content for virtual drops. */
  paths?: string[]
  files?: Array<{ name: string; data: string; mime?: string }>
  origin?: 'desktop' | 'mobile' | 'harmony'
  dropContext?: Record<string, unknown>
}

export interface ThemeSyncPayload {
  theme: 'light' | 'dark' | 'system'
  accent?: string
  source: 'web' | 'shell'
  timestamp: number
}

export interface ShortcutTriggerPayload {
  id: string
  /** Normalized shortcut string, e.g. "Ctrl+Shift+D". */
  shortcut: string
  pressedAt: number
}

export interface HmsPushPayload {
  title: string
  body: string
  /** Push activity intent URI forwarded to HMS Kit (HarmonyOS only). */
  intentUri?: string
  sound?: boolean
}

/** Canonical native endpoints per platform. */
export const NATIVE_ENDPOINTS = {
  desktop: 'http://127.0.0.1:9527',
  mobile: 'http://127.0.0.1:9527',
  harmony: 'http://127.0.0.1:9527'
} as const

export type NativePlatform = keyof typeof NATIVE_ENDPOINTS

/** Typed event map for payloads of each DSH event. */
export interface DSHEventPayloads {
  'session/start': Session
  'session/event': SessionEvent
  'turn/start': Turn
  'turn/end': Turn
  'agent/error': Error
  'web/client/slot': import('./types').Slot
}

/** Create a request envelope with a fresh correlation id. */
export function bridgeRequest(method: BridgeMethod, payload: Record<string, any>): BridgeRequest {
  return { id: crypto.randomUUID(), method, payload }
}

/** Create a success response matching a request id. */
export function bridgeResponse(request: BridgeRequest | { id: string }, data?: any): BridgeResponse {
  return { id: request.id, success: true, data, version: PROTOCOL_VERSION }
}

/** Create an error response matching a request id. */
export function bridgeError(request: BridgeRequest | { id: string }, error: unknown): BridgeResponse {
  return {
    id: request.id,
    success: false,
    error: error instanceof Error ? error.message : String(error),
    version: PROTOCOL_VERSION
  }
}

/** Parse an unknown JSON value into a BridgeResponse, or null if malformed. */
export function parseBridgeResponse(input: unknown): BridgeResponse | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.success !== 'boolean') return null
  return record as unknown as BridgeResponse
}

/** Parse an unknown JSON value into a BridgeRequest, or null if malformed. */
export function parseBridgeRequest(input: unknown): BridgeRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as Record<string, unknown>
  const method = record.method
  if (typeof record.id !== 'string') return null
  if (typeof method !== 'string' || !(BRIDGE_METHODS as readonly string[]).includes(method)) return null
  const payload = record.payload
  if (payload !== null && typeof payload !== 'object') return null
  return { id: record.id, method: method as BridgeMethod, payload: (payload ?? {}) as Record<string, any> }
}

/** Serialize a DSH event to JSON (used by plugins talking to shells). */
export function dshEvent(event: DSHEvent): string {
  return JSON.stringify(event)
}

/** Register a DSH event payload shape map (type-level helper). */
export type DSHListener<K extends DSHEventType> = (payload: DSHEventPayloads[K]) => void
