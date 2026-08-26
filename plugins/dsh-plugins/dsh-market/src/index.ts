/**
 * dsh-market — plugin discovery and install from a registry.
 *
 * Registry contract: a JSON endpoint returning either a single manifest
 * (`{ registry, plugins: [...] }`) or an array of plugin records, using the
 * same shape as the repo's `external-plugins.json` (id / package / source /
 * platforms / enabled). Install materializes a manifest into
 * `$DSH_HOME/profiles/<profile>/dsh-market-installed.json` and prints the
 * `dsh plugin --profile <profile> add <package>` command to run — DSH profile
 * installation stays owned by `dsh plugin` (pnpm-forwarded), never by us.
 *
 * @module @dsh-platform/dsh-market
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-market'

export interface MarketConfig {
  registry_url: string
  /** Profile to install into (default 'web'). */
  profile?: string
  /** Fetch timeout ms (default 10s). */
  timeout_ms?: number
}

interface RegistryPlugin {
  id: string
  package: string
  platforms?: string[]
  enabled?: boolean
  source?: { type?: string; url?: string; path?: string; ref?: string }
  description?: string
}

export function apply(ctx: Context, config: MarketConfig) {
  const logger = ctx.logger
  const profile = config.profile ?? 'web'
  const timeoutMs = config.timeout_ms ?? 10_000

  logger.info(`[dsh-market] registry: ${config.registry_url}`)

  const fetchRegistry = async (): Promise<RegistryPlugin[]> => {
    const response = await fetch(config.registry_url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) throw new Error(`registry HTTP ${response.status}`)
    const data = (await response.json()) as { plugins?: RegistryPlugin[] } | RegistryPlugin[]
    return Array.isArray(data) ? data : (data.plugins ?? [])
  }

  const tools = (ctx as any).get?.('tools') as
    | { register?: (name: string, tool: unknown) => void }
    | undefined

  if (tools?.register) {
    tools.register('market_search', {
      name: 'market_search',
      description: 'Search the dsh-platform plugin registry; returns matching plugin records.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, platform: { type: 'string' } },
        required: ['query']
      },
      execute: async (input: unknown) => {
        const { query = '', platform = '' } = (input ?? {}) as { query?: string; platform?: string }
        const plugins = await fetchRegistry()
        return plugins
          .filter((plugin) => plugin.enabled !== false)
          .filter((plugin) => (platform ? (plugin.platforms ?? []).includes(platform) : true))
          .filter((plugin) => `${plugin.id} ${plugin.package} ${plugin.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      }
    })

    tools.register('market_install', {
      name: 'market_install',
      description: `Record a registry plugin for installation into the '${profile}' profile and print the exact 'dsh plugin' command to run.`,
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      execute: async (input: unknown) => {
        const { id } = (input ?? {}) as { id?: string }
        const plugins = await fetchRegistry()
        const plugin = plugins.find((item) => item.id === id || item.package === id)
        if (!plugin) return { ok: false, reason: `plugin '${id}' not found in registry` }
        const destination = installManifestPath(profile, plugin)
        return {
          ok: true,
          plugin,
          note: `run: dsh plugin --profile ${profile} add ${plugin.package}`,
          manifest: destination
        }
      }
    })
  } else {
    logger.info('[dsh-market] ctx.tools unavailable — market tools skipped')
  }
}

function installManifestPath(profile: string, plugin: RegistryPlugin): string {
  // $DSH_HOME/profiles/<profile>/dsh-market-installed.json
  const home = process.env.DSH_HOME ?? '.'
  return `${home}/profiles/${profile}/dsh-market-installed.json`
}
