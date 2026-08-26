#!/usr/bin/env node
/**
 * prepare-external-plugins — validate external-plugins.json entries and
 * report `dir` sources (never mutates another project's tree).
 *
 * Usage:
 *   node scripts/prepare-external-plugins.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const manifestPath = join(repoRoot, 'external-plugins.json')
if (!existsSync(manifestPath)) {
  console.error('[prepare-external-plugins] ERROR: external-plugins.json missing')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

let problems = 0
for (const plugin of manifest.plugins ?? []) {
  if (!plugin.enabled) {
    console.log(`[prepare-external-plugins] skip (disabled): ${plugin.id}`)
    continue
  }
  if (plugin.source.type === 'dir') {
    const dir = resolve(repoRoot, plugin.source.path)
    if (!existsSync(dir)) {
      console.warn(`[prepare-external-plugins] WARN: ${plugin.id} source dir missing: ${dir}`)
      problems += 1
      continue
    }
    const entry = join(dir, 'lib', 'index.js')
    const patch = join(dir, 'cordis.patch.yml')
    const built = existsSync(entry)
    console.log(
      `[prepare-external-plugins] ok: ${plugin.id} (${dir}; entry=${built ? 'built' : 'not-built'} patch=${existsSync(patch) ? 'yes' : 'no'})`
    )
    if (!built) {
      console.warn(`[prepare-external-plugins] WARN: ${plugin.id} needs 'pnpm build' inside ${dir}`)
      problems += 1
    }
  } else {
    console.log(`[prepare-external-plugins] git source (not materialized): ${plugin.id} → ${plugin.source.url}`)
  }
}

if (problems > 0) {
  console.error(`[prepare-external-plugins] done with ${problems} problem(s)`)
  process.exitCode = 1
} else {
  console.log('[prepare-external-plugins] done')
}
