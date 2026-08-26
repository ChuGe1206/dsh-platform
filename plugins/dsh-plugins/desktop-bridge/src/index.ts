/**
 * desktop-bridge — the seam between DSH and a dsh-platform native shell.
 *
 * Talks the shared-bridge wire protocol (POST JSON to
 * `http://127.0.0.1:<native_port>/{method}`). Every failure is swallowed so
 * bridge outages never block DSH core functionality.
 *
 * @module @dsh-platform/desktop-bridge
 */
import type { Context } from '@deepseek-ai/cordis'
import type { NotifyPayload, StatusPayload } from '@dsh-platform/shared-bridge'

export const name = 'desktop-bridge'

export interface BridgeConfig {
  /** local = desktop sidecar; remote = mobile/harmony (endpoint points at the device). */
  mode: 'local' | 'remote'
  native_port: number
  /** Used in remote mode: e.g. `http://192.168.1.10:9527`. */
  remote_endpoint?: string
  /** Route turn notifications through /hms-push (HarmonyOS). */
  use_hms_push?: boolean
  /** Notification debounce window in ms (turn/end + agent/turn-stopping dedupe). */
  debounce_ms?: number
}

/** Events a dsh-platform plugin may listen to (stable seams). */
export type BridgeEventName =
  | 'agent/turn-stopping'
  | 'turn/end'
  | 'session/start'
  | 'web/theme-changed'
  | 'desktop/file-drop'

function endpointFor(config: BridgeConfig): string {
  return config.mode === 'local'
    ? `http://127.0.0.1:${config.native_port}`
    : (
        config.remote_endpoint ??
        `http://127.0.0.1:${config.native_port}`
      )
}

async function post(endpoint: string, path: string, body: unknown): Promise<void> {
  try {
    const response = await fetch(`${endpoint}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch {
    /* silent: bridge failures never block DSH (constraint #5) */
  }
}

export function apply(ctx: Context, config: BridgeConfig) {
  const logger = ctx.logger
  const endpoint = endpointFor(config)
  const debounceMs = config.debounce_ms ?? 1500
  logger.info(`[desktop-bridge] starting in ${config.mode} mode → ${endpoint}`)

  // Custom seam events (agent/*, web/*, desktop/*) are outside cordis' typed
  // Events map — register them through a string-keyed cast.
  const onCustom = (ctx.on as (event: string, listener: (payload?: unknown) => void) => unknown).bind(ctx)

  // ---- 1. Turn-completion notification ------------------------------------
  let lastNotifiedAt = 0
  const notifyTurnDone = async () => {
    const now = Date.now()
    if (now - lastNotifiedAt < debounceMs) return
    lastNotifiedAt = now
    const payload: NotifyPayload = {
      title: 'DSH Agent',
      body: '任务已完成',
      sound: true
    }
    if (config.use_hms_push) {
      await post(endpoint, 'hms-push', payload)
    } else {
      await post(endpoint, 'notify', payload)
    }
  }

  onCustom('agent/turn-stopping', () => {
    void notifyTurnDone()
  })
  onCustom('turn/end', () => {
    void notifyTurnDone()
  })

  // ---- 2. Status reporting (every 5s) -------------------------------------
  ctx.effect(() => {
    const interval = setInterval(() => {
      const status: StatusPayload = {
        // ctx.sessions is optional: count via the seam when available.
        activeSessions: safeSessionCount(ctx),
        timestamp: Date.now()
      }
      void post(endpoint, 'status', status)
    }, 5000)

    return () => clearInterval(interval)
  }, 'desktop-bridge.status-report')

  // ---- 3. Theme synchronisation ------------------------------------------
  onCustom('web/theme-changed', (theme) => {
    const payload = {
      theme: typeof theme === 'string' ? theme : 'system' as string,
      source: 'web' as const,
      timestamp: Date.now()
    }
    void post(endpoint, 'theme-sync', payload)
  })

  // ---- 4. File drop (desktop only) ----------------------------------------
  if (config.mode === 'local') {
    onCustom('desktop/file-drop', (payload) => {
      void post(endpoint, 'file-drop', payload ?? {})
    })
  }
}

function safeSessionCount(ctx: Context): number {
  const sessions = (ctx as any).get?.('sessions') as
    | { list?: () => unknown[] | Promise<unknown[]> }
    | undefined
  if (!sessions || typeof sessions.list !== 'function') return 0
  try {
    const list = sessions.list()
    if (list && typeof list === 'object' && typeof (list as any).then === 'function') {
      // async list: resolve opportunistically; the 5s tick covers the gap
      return 0
    }
    return Array.isArray(list) ? list.length : 0
  } catch {
    return 0
  }
}
