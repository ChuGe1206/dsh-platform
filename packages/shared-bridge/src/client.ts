/**
 * BridgeClient — request/response + fire-and-forget client for the native
 * shell HTTP bridge (Tauri desktop / mobile, HarmonyOS ArkWeb).
 *
 * Semantics:
 *  - Every method POSTs a JSON {@link BridgeRequest} to `<endpoint>/<method>`.
 *  - The native server replies {@link BridgeResponse} synchronously.
 *  - Failures are silent by default (`failSilent`) so bridge outages never
 *    block DSH core functionality (constraint #5).
 *  - `onRequest` lets a WebView host handle native-initiated requests
 *    (e.g. `shortcut-trigger` forwarded from the shell).
 *
 * @module @dsh-platform/shared-bridge/client
 */
import {
  NATIVE_ENDPOINTS,
  PROTOCOL_VERSION,
  bridgeRequest,
  parseBridgeResponse,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
  type FileDropPayload,
  type HmsPushPayload,
  type NotifyPayload,
  type ShortcutTriggerPayload,
  type StatusPayload,
  type ThemeSyncPayload
} from './protocol'

export interface BridgeClientOptions {
  endpoint?: string
  /** Defaults to desktop loopback. */
  platform?: keyof typeof NATIVE_ENDPOINTS
  timeoutMs?: number
  /** When true, transport errors are swallowed (default true). */
  failSilent?: boolean
  /** Retry count for transient errors (default 0). */
  retries?: number
}

export interface PendingRequest {
  resolve: (response: BridgeResponse) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

type RequestListener = (request: BridgeRequest) => void | Promise<void>

export class BridgeClient {
  private readonly endpoint: string
  private readonly options: {
    timeoutMs: number
    failSilent: boolean
    retries: number
  }
  private readonly pending = new Map<string, PendingRequest>()
  private readonly listeners = new Set<RequestListener>()
  private nextId = 0

  constructor(options: BridgeClientOptions = {}) {
    const platform = options.platform ?? 'desktop'
    this.endpoint = options.endpoint ?? NATIVE_ENDPOINTS[platform]
    this.options = {
      timeoutMs: options.timeoutMs ?? 4000,
      failSilent: options.failSilent ?? true,
      retries: options.retries ?? 0
    }
  }

  /** The resolved native endpoint. */
  get url(): string {
    return this.endpoint
  }

  /**
   * Send a bridged request and await the native response.
   * Resolves `undefined` when failing silently.
   */
  async request(method: BridgeMethod, payload: Record<string, any> = {}): Promise<BridgeResponse | undefined> {
    const request = { ...bridgeRequest(method, payload), id: `${Date.now()}-${this.nextId++}` }
    const response = await this.post(request)
    if (response) {
      this.pending.delete(request.id)
      clearTimeout(this.pending.get(request.id)?.timer)
    }
    return response
  }

  /** Fire-and-forget with silent failure. */
  async send(method: BridgeMethod, payload: Record<string, any> = {}): Promise<void> {
    try {
      await this.request(method, payload)
    } catch {
      /* silence per constraint #5 */
    }
  }

  /** Typed convenience methods. */

  async notify(payload: NotifyPayload): Promise<BridgeResponse | undefined> {
    return this.request('notify', payload as unknown as Record<string, any>)
  }

  async reportStatus(payload: StatusPayload): Promise<void> {
    await this.send('status', payload as unknown as Record<string, any>)
  }

  async fileDrop(payload: FileDropPayload): Promise<void> {
    await this.send('file-drop', payload as unknown as Record<string, any>)
  }

  async themeSync(payload: ThemeSyncPayload): Promise<void> {
    await this.send('theme-sync', payload as unknown as Record<string, any>)
  }

  async shortcutTrigger(payload: ShortcutTriggerPayload): Promise<void> {
    await this.send('shortcut-trigger', payload as unknown as Record<string, any>)
  }

  async hmsPush(payload: HmsPushPayload): Promise<void> {
    await this.send('hms-push', payload as unknown as Record<string, any>)
  }

  /** Native → WebView requests (e.g. forwards of global shortcuts). */
  onRequest(listener: RequestListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Handle an inbound request supplied by a transport (WebView postMessage / raw HTTP). */
  async handleInbound(request: BridgeRequest): Promise<BridgeResponse> {
    let data: any
    try {
      for (const listener of this.listeners) {
        const result = await listener(request)
        if (result !== undefined) data = result
      }
      return { id: request.id, success: true, data, version: PROTOCOL_VERSION }
    } catch (err) {
      return { id: request.id, success: false, error: err instanceof Error ? err.message : String(err), version: PROTOCOL_VERSION }
    }
  }

  /** Health probe: GET the endpoint root; resolves to the raw status. */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint, { method: 'GET', signal: AbortSignal.timeout(this.options.timeoutMs) })
      return response.ok
    } catch {
      return false
    }
  }

  private async post(request: BridgeRequest): Promise<BridgeResponse | undefined> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await fetch(`${this.endpoint}/${request.method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(this.options.timeoutMs)
        })
        if (!response.ok) throw new Error(`bridge ${request.method} failed: HTTP ${response.status}`)
        const parsed = parseBridgeResponse(await response.json())
        if (!parsed) throw new Error(`bridge ${request.method}: malformed response`)
        return parsed
      } catch (err) {
        lastError = err
      }
    }
    if (this.options.failSilent) return undefined
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}

/** Shortcut: create a client for a given platform with sane defaults. */
export function createBridgeClient(options: BridgeClientOptions = {}): BridgeClient {
  return new BridgeClient(options)
}
