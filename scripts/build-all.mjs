#!/usr/bin/env node
/**
 * build-all — production pipeline for the dsh-platform monorepo.
 *
 * Steps:
 *   1. prepare:harness (submodule check + overlay rendering)
 *   2. turbo run build (TS/Vue packages, plugin lib builds)
 *   3. cargo build --release for the desktop shell (apps/desktop/src-tauri)
 *   4. copy the DSH CLI + overlays into apps/desktop/src-tauri/runtime/ so
 *      `tauri build` bundles them as resources
 *
 * Outputs a summary; exits non-zero on the first failure.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const steps = []
function run(label, command, args, options = {}) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: options.cwd ?? repoRoot, ...options })
  if (result.status !== 0) {
    console.error(`\n[build-all] FAILED: ${label} (exit ${result.status})`)
    process.exit(result.status ?? 1)
  }
  steps.push(label)
}

// 1. prepare
run('prepare:harness', 'node', ['scripts/prepare-harness.mjs'])

// 2. workspace builds (turbo)
run('turbo run build', 'pnpm', ['exec', 'turbo', 'run', 'build'])

// 3. cargo release build (desktop shell)
run('cargo build --release (desktop)', 'cargo', ['build', '--release', '-p', 'dsh-platform'])

// 4. runtime bundle for tauri resources
const runtimeDir = join(repoRoot, 'apps', 'desktop', 'src-tauri', 'runtime')
mkdirSync(join(runtimeDir, 'harness', 'apps'), { recursive: true })
const cliBuild = join(repoRoot, 'harness', 'apps', 'cli', 'lib', 'bin.js')
const npmCli = join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh')
if (existsSync(cliBuild)) {
  cpSync(join(repoRoot, 'harness', 'apps', 'cli'), join(runtimeDir, 'harness', 'apps', 'cli'), { recursive: true })
  steps.push('runtime/harness/apps/cli (from submodule build)')
} else if (existsSync(npmCli)) {
  cpSync(npmCli, join(runtimeDir, 'harness', 'apps', 'cli'), { recursive: true })
  steps.push('runtime/harness/apps/cli (from npm @deepseek-ai/dsh)')
} else {
  console.warn('[build-all] WARN: no DSH CLI to bundle into runtime/')
}
cpSync(join(repoRoot, 'config'), join(runtimeDir, 'config'), { recursive: true })
steps.push('runtime/config (overlay templates)')

console.log(`\n[build-all] done: ${steps.join(' → ')}`)
