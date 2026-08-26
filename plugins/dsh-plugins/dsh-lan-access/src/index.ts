/**
 * dsh-lan-access — LAN reachability for mobile/harmony remote clients.
 *
 * The DSH web server itself intentionally binds loopback only (`--host
 * 0.0.0.0` is rejected upstream). This plugin therefore provides the
 * *transport plumbing* for LAN reach: interface discovery, URL advertisement
 * (for SSH port-forwarding / Tailscale-style setups), and a status command
 * the RemoteClient can poll.
 *
 * @module @dsh-platform/dsh-lan-access
 */
import { networkInterfaces } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-lan-access'

export interface LanAccessConfig {
  /** Interval between LAN advertisement logs in ms (default 60s). */
  advertise_interval?: number
  /** Whether to print the web URL every tick (default true). */
  advertise?: boolean
}

interface LanInterface {
  name: string
  address: string
  family: 'IPv4' | 'IPv6'
  internal: boolean
}

export function apply(ctx: Context, config: LanAccessConfig) {
  const logger = ctx.logger
  const advertise = config.advertise ?? true
  const intervalMs = config.advertise_interval ?? 60_000

  const listLanInterfaces = (): LanInterface[] =>
    Object.entries(networkInterfaces())
      .flatMap(([name, entries]) =>
        (entries ?? []).map((entry) => ({
          name,
          address: entry.address,
          family: entry.family as 'IPv4' | 'IPv6',
          internal: entry.internal ?? false
        }))
      )
      .filter((entry) => !entry.internal && entry.family === 'IPv4')

  const webUrlFromContext = (): string | null => {
    // The web runtime service (dsh-web-app) exposes the canonical URL.
    const server = (ctx as Record<string, any>).get?.('webServer')
    const port = server?.port
    return typeof port === 'number' ? `http://127.0.0.1:${port}` : null
  }

  ctx.effect(() => {
    const tick = () => {
      const url = webUrlFromContext()
      const lan = listLanInterfaces()
      if (url && advertise) {
        logger.info(
          `[dsh-lan-access] reachable: ${url} (LAN: ${lan.map((item) => item.address).join(', ') || 'none'})`
        )
      }
    }
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  }, 'dsh-lan-access.advertise')

  const commands = (ctx as any).get?.('commands') as
    | { register?: (name: string, handler: (input: unknown) => unknown) => void }
    | undefined
  if (commands?.register) {
    commands.register('lan/status', () => ({
      webUrl: webUrlFromContext(),
      interfaces: listLanInterfaces(),
      hint: 'DSH web binds loopback only; expose it to LAN via a port-forward or tunnel, then point RemoteClient at the forwarded host.'
    }))
  }
}
