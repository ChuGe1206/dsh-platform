/**
 * Plugin registry — parses `external-plugins.json` (or any registry
 * manifest) and resolves local/remote plugin sources into concrete
 * workspace-relative paths or package names.
 *
 * @module @dsh-platform/shared-dsh/plugin-registry
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type PluginPlatform = 'desktop' | 'mobile' | 'harmony'

export interface PluginSourceDir {
  type: 'dir'
  /** Absolute, or relative to the manifest's directory. */
  path: string
}

export interface PluginSourceGit {
  type: 'git'
  url: string
  /** Optional git ref (tag/branch/commit). */
  ref?: string
}

export type PluginSource = PluginSourceDir | PluginSourceGit

export interface ExternalPlugin {
  id: string
  package: string
  source: PluginSource
  platforms: PluginPlatform[]
  enabled: boolean
  description?: string
}

export interface PluginRegistryManifest {
  registry?: string
  plugins: ExternalPlugin[]
}

export interface ResolvedPlugin extends ExternalPlugin {
  /** Absolute local directory when the source is a dir and it exists. */
  localDir?: string
  /** Absolute path to the plugin's entry (lib/index.js preferred). */
  entry?: string
  /** Absolute path to the bundle patch (cordis.patch.yml) when present. */
  patch?: string
  warning?: string
}

export class RegistryError extends Error {
  constructor(message: string, readonly file?: string) {
    super(file ? `${message} (${file})` : message)
    this.name = 'RegistryError'
  }
}

/** Load and validate an external-plugins.json manifest. */
export function loadRegistry(file: string): PluginRegistryManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new RegistryError('cannot parse registry manifest', file)
  }
  if (typeof parsed !== 'object' || parsed === null) throw new RegistryError('registry manifest must be an object', file)
  const record = parsed as Record<string, unknown>
  if (!Array.isArray(record.plugins)) throw new RegistryError('registry manifest lacks a plugins array', file)
  const plugins: ExternalPlugin[] = record.plugins.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) throw new RegistryError(`plugins[${index}] is not an object`, file)
    const p = entry as Record<string, unknown>
    if (typeof p.id !== 'string' || typeof p.package !== 'string') {
      throw new RegistryError(`plugins[${index}] requires string id and package`, file)
    }
    const source = p.source as Record<string, unknown>
    if (typeof source !== 'object' || source === null || typeof source.type !== 'string') {
      throw new RegistryError(`plugins[${index}] requires a source object with type`, file)
    }
    if (source.type !== 'dir' && source.type !== 'git') {
      throw new RegistryError(`plugins[${index}] source.type must be 'dir' or 'git'`, file)
    }
    return {
      id: p.id,
      package: p.package,
      source: source as unknown as PluginSource,
      platforms: Array.isArray(p.platforms) ? (p.platforms as PluginPlatform[]) : ['desktop'],
      enabled: (p.enabled as boolean) ?? true,
      ...(typeof p.description === 'string' ? { description: p.description } : {})
    }
  })
  return { ...(typeof record.registry === 'string' ? { registry: record.registry } : {}), plugins }
}

/**
 * Resolve a manifest against a base directory (usually the repo root).
 * `git` sources are reported with a warning when not checked out locally.
 */
export function resolvePlugins(
  manifest: PluginRegistryManifest,
  baseDir: string,
  options: { onlyEnabled?: boolean; platform?: PluginPlatform } = {}
): ResolvedPlugin[] {
  const result: ResolvedPlugin[] = []
  for (const plugin of manifest.plugins) {
    if (options.onlyEnabled !== false && !plugin.enabled) continue
    if (options.platform && !plugin.platforms.includes(options.platform)) continue
    const resolved: ResolvedPlugin = { ...plugin }
    if (plugin.source.type === 'dir') {
      const dir = resolve(baseDir, plugin.source.path)
      resolved.localDir = dir
      if (!existsSync(dir)) {
        resolved.warning = `local plugin directory missing: ${dir}`
      } else {
        for (const candidate of ['lib/index.js', 'dist/index.js', 'index.js']) {
          const entry = join(dir, candidate)
          if (existsSync(entry)) {
            resolved.entry = entry
            break
          }
        }
        const patch = join(dir, 'cordis.patch.yml')
        if (existsSync(patch)) resolved.patch = patch
        if (!resolved.entry && !resolved.patch) {
          resolved.warning = `plugin ${plugin.id} has no entry (lib/index.js, dist/index.js) — build it first`
        }
      }
    } else {
      resolved.warning = `git source for ${plugin.id} is not materialized; clone it into plugins/${plugin.id}`
    }
    result.push(resolved)
  }
  return result
}

/** Load + resolve against a comma of bases in one call (root-relative). */
export function resolveRegistry(file: string, baseDir: string): ResolvedPlugin[] {
  return resolvePlugins(loadRegistry(file), baseDir)
}
