/**
 * RemoteClient — mobile / HarmonyOS connection to a remote DSH web instance.
 *
 * Desktop runs DSH as a sidecar in-process; mobile and HarmonyOS connect over
 * the network instead. The client is deliberately transport-open:
 *  - `http` endpoints are probed with GET (health) and used for the bridge;
 *  - the session/event channel is pluggable (`EventTransport`), with a
 *    WebSocket transport for browsers and a minimal polling fallback.
 *
 * @module @dsh-platform/shared-dsh/remote-client
 */
import type { DSHEvent } from '@dsh-platform/shared-bridge'

export interface RemoteEndpoints {
  /** Base URL of the remote DSH web server, e.g. http://192.168.1.10:7788 */
  base: string
  /** Bridge endpoint (native shell server) on the device. */
  bridge?: string
}

export interface EventTransport {
  connect(): Promise<void>
  send(event: DSHEvent): Promise<void>
  close(): void
  onEvent(listener: (event: DSHEvent) => void): void
}

export interface RemoteClientOptions {
  endpoint: string
  /** Poll interval for the fallback (default 15s). */
  pollIntervalMs?: number
  /** Timeout for health probes (default 3s). */
  probeTimeoutMs?: number
  /** Prefer the WebSocket transport when available. */
  preferWebSocket?: boolean
}

type EventListener = (event: DSHEvent) => void
type DisconnectListener = (reason?: string) => void

export interface HealthState {
  online: boolean
  latencyMs?: number
  version?: string | null
}

/**
 * WebSocket transport: `/__dsh/events` is the dsh-platform convention for the
 * remote event channel (documented; not part of the pinned DSH tag).
 */
export class WebSocketEventTransport implements EventTransport {
  private socket: WebSocket | null = null
  private readonly listeners = new Set<EventListener>()

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      const socket = new WebSocket(this.url)
      socket.addEventListener('open', () => resolvePromise(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`websocket connect failed: ${this.url}`)), { once: true })
      socket.addEventListener('message', (message: MessageEvent) => {
        try {
          const event = JSON.parse(String(message.data)) as DSHEvent
          for (const listener of this.listeners) listener(event)
        } catch {
          /* ignore malformed frames */
        }
      })
      this.socket = socket
    })
  }

  async send(event: DSHEvent): Promise<void> {
    this.socket?.send(JSON.stringify(event))
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }

  onEvent(listener: EventListener): void {
    this.listeners.add(listener)
  }
}

/**
 * Polling fallback: GET `<base>/api/sessions/events?since=<last>`.
 */
export class PollingEventTransport implements EventTransport {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<EventListener>()
  private lastTimestamp = 0

  constructor(
    private readonly base: string,
    private readonly intervalMs: number
  ) {}

  async connect(): Promise<void> {
    this.timer = setInterval(async () => {
      try {
        const response = await fetch(`${this.base}/api/sessions/events?since=${this.lastTimestamp}`, {
          signal: AbortSignal.timeout(10_000)
        })
        if (!response.ok) return
        const events = (await response.json()) as DSHEvent[]
        for (const event of events) {
          if (typeof event.timestamp === 'number' && event.timestamp > this.lastTimestamp) {
            this.lastTimestamp = event.timestamp
          }
          for (const listener of this.listeners) listener(event)
        }
      } catch {
        /* poll again later */
      }
    }, this.intervalMs)
  }

  async send(_event: DSHEvent): Promise<void> {
    /* polling transport is receive-only */
  }

  close(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  onEvent(listener: EventListener): void {
    this.listeners.add(listener)
  }
}

/**
 * Client entry point: probes the remote endpoint and wires the event
 * transport (WebSocket preferred, polling fallback).
 */
export class RemoteClient {
  private transport: EventTransport | null = null
  private readonly eventListeners = new Set<EventListener>()
  private readonly disconnectListeners = new Set<DisconnectListener>()
  private state: 'idle' | 'connecting' | 'connected' | 'closed' = 'idle'

  constructor(private readonly options: RemoteClientOptions) {}

  get status(): 'idle' | 'connecting' | 'connected' | 'closed' {
    return this.state
  }

  /** Probe the remote DSH web server. */
  async probe(): Promise<HealthState> {
    const started = Date.now()
    try {
      const response = await fetch(this.options.endpoint, {
        signal: AbortSignal.timeout(this.options.probeTimeoutMs ?? 3000)
      })
      const version = response.headers.get('x-dsh-version')
      return { online: response.ok, latencyMs: Date.now() - started, version }
    } catch {
      return { online: false }
    }
  }

  /** Connect the event transport (no-op when already connected). */
  async connect(): Promise<void> {
    if (this.state === 'connected') return
    const health = await this.probe()
    if (!health.online) throw new Error(`remote DSH endpoint unreachable: ${this.options.endpoint}`)
    const preferred = this.options.preferWebSocket ?? typeof WebSocket !== 'undefined'
    const wsUrl = this.options.endpoint.replace(/^http/, 'ws') + '/__dsh/events'
    const transport: EventTransport = preferred
      ? new WebSocketEventTransport(wsUrl)
      : new PollingEventTransport(this.options.endpoint, this.options.pollIntervalMs ?? 15_000)
    this.transport = transport
    this.state = 'connecting'
    try {
      await transport.connect()
    } catch {
      if (transport instanceof WebSocketEventTransport) {
        const fallback = new PollingEventTransport(
          this.options.endpoint,
          this.options.pollIntervalMs ?? 15_000
        )
        await fallback.connect()
        this.transport = fallback
      } else {
        throw new Error(`remote event transport failed: ${this.options.endpoint}`)
      }
    }
    transport.onEvent((event) => {
      for (const listener of this.eventListeners) listener(event)
    })
    this.state = 'connected'
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  /** Push a shape event for the remote session (e.g. mobile-local actions). */
  async send(event: DSHEvent): Promise<void> {
    if (!this.transport || this.state !== 'connected') throw new Error('remote client not connected')
    await this.transport.send(event)
  }

  close(): void {
    this.transport?.close()
    this.transport = null
    this.state = 'closed'
    for (const listener of this.disconnectListeners) listener('closed')
  }

  /** List remote sessions through the documented /api/sessions JSON endpoint. */
  async listSessions(): Promise<unknown[]> {
    const response = await fetch(`${this.options.endpoint}/api/sessions`, {
      signal: AbortSignal.timeout(this.options.probeTimeoutMs ?? 3000)
    })
    if (!response.ok) throw new Error(`remote sessions failed: HTTP ${response.status}`)
    const data = (await response.json()) as { sessions?: unknown[] } | unknown[]
    return Array.isArray(data) ? data : (data.sessions ?? [])
  }
}
