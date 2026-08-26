#!/usr/bin/env node
/**
 * publish-harmony 鈥?build & install the HarmonyOS entry HAP.
 *
 * Requires DevEco Studio (hvigorw) and a connected device/emulator.
 * Steps: hvigor assembleHap 鈫?hdc install. Fails gracefully when the
 * toolchain is absent (CI/dry-run friendly).
 *
 * Usage:
 *   node scripts/publish-harmony.mjs [--hap <path>] [--dry-run]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const harmonyRoot = join(repoRoot, 'apps', 'harmonyos')
const dryRun = process.argv.includes('--dry-run')

function log(message) {
  console.log(`[publish-harmony] ${message}`)
}

if (!existsSync(join(harmonyRoot, 'entry'))) {
  console.error('[publish-harmony] ERROR: apps/harmonyos/entry missing (open the project in DevEco Studio once)')
  process.exit(1)
}

const hvigor = await findHvigor()
if (!hvigor) {
  log('WARN: hvigor not found (DevEco Studio not installed); publishing skipped.')
  log('      Build the HAP inside DevEco Studio: Build > Build Hap(s)/APP(s).')
  process.exit(0)
}

function findHvigor() {
  const candidates = [
    join(harmonyRoot, 'hvigorw.bat'),
    join(harmonyRoot, 'hvigorw'),
    process.env.HVIGORW ?? ''
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

// Verify the frontend assets are present; they come from `pnpm build` of
// apps/harmonyos (vite 鈫?entry/src/main/resources/rawfile).
const rawfile = join(harmonyRoot, 'entry', 'src', 'main', 'resources', 'rawfile')
if (!existsSync(rawfile) || readdirSync(rawfile).length === 0) {
  log(`WARN: rawfile assets missing at ${rawfile} 鈥?run 'pnpm build' in apps/harmonyos first`)
}

if (dryRun) {
  log(`dry-run: hvigor assembleHap in ${harmonyRoot}`)
  process.exit(0)
}

const build = spawnSync(hvigor, ['assembleHap', '--mode', 'module', '-p', 'product=default'], {
  stdio: 'inherit',\n  cwd: harmonyRoot,\n  shell: true\n})
if (build.status !== 0) {
  console.error(`[publish-harmony] hvigor failed (exit ${build.status})`)
  process.exit(build.status ?? 1)
}

const hap = findHap()
if (!hap) {
  console.error('[publish-harmony] HAP not found after build')
  process.exit(1)
}
log(`installing ${hap}`)
const install = spawnSync('hdc', ['install', '-r', hap], { stdio: 'inherit', shell: true })
process.exit(install.status ?? 1)

function findHap() {
  const dir = join(harmonyRoot, 'entry', 'build', 'default', 'outputs', 'default')
  if (!existsSync(dir)) return null
  const candidates = readdirSync(dir).filter((name) => name.endsWith('.hap'))
  return candidates.length > 0 ? join(dir, candidates[0]) : null
}
