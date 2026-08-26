#!/usr/bin/env node
/**
 * measure-startup — 测量桌面壳启动时间（验证标准 6.3 基线）。
 *
 * 流程（模拟 pnpm tauri dev 的运行时部分，不含 Rust 编译）：
 *   1. 启动 vite dev server（apps/desktop，1420）
 *   2. 启动 target/debug/dsh-platform.exe
 *   3. 计时：进程出现 → 原生桥(:9527)健康 → sidecar DSH Web HTTP 200
 *   4. 输出各阶段耗时并清理进程
 *
 * 用法：
 *   node scripts/measure-startup.mjs [--exe path] [--skip-vite]
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const exe =
  process.argv.find((arg) => arg.startsWith('--exe='))?.split('=')[1] ??
  join(repoRoot, 'target', 'debug', 'dsh-platform.exe')
const skipVite = process.argv.includes('--skip-vite')

const t0 = Date.now()
const milestones = {}

function mark(name, detail = '') {
  if (milestones[name]) return
  milestones[name] = { ms: Date.now() - t0, detail }
  console.log(`[measure] ${name}: +${milestones[name].ms}ms ${detail}`)
}

async function probe(url) {
  return new Promise((resolvePromise) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      res.resume()
      resolvePromise(res.statusCode === 200)
    })
    req.on('error', () => resolvePromise(false))
    req.on('timeout', () => {
      req.destroy()
      resolvePromise(false)
    })
  })
}

/** GET 页面并确认是 DSH Web（标题/内容含 DeepSeek）。 */
function probePage(url) {
  return new Promise((resolvePromise) => {
    const req = http.get(url, { timeout: 4000 }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolvePromise(res.statusCode === 200 && /DeepSeek/i.test(body)))
    })
    req.on('error', () => resolvePromise(false))
    req.on('timeout', () => {
      req.destroy()
      resolvePromise(false)
    })
  })
}

const children = []
function spawnChild(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'ignore', windowsHide: true, shell: true })
  children.push(child)
  return child
}

if (!existsSync(exe)) {
  console.error(`[measure] exe 不存在: ${exe} — 请先构建 (cargo build --bin dsh-platform 或 pnpm tauri:dev)`)
  process.exit(1)
}

// 1. vite
if (!skipVite) {
  console.log(`[measure] 启动 vite dev server ...`)
  spawnChild(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['dev'], join(repoRoot, 'apps', 'desktop'))
  for (let i = 0; i < 60; i++) {
    if (await probe('http://127.0.0.1:1420/')) break
    await new Promise((r) => setTimeout(r, 500))
  }
  mark('vite-ready', 'http://127.0.0.1:1420')
} else {
  mark('vite-ready', 'skip')
}

// 2. 启动壳
const app = spawnChild(exe, [])
mark('process-spawned', exe)

// 3. 轮询
const deadline = Date.now() + 90_000
let bridgeReady = false
let webReady = false
while (Date.now() < deadline) {
  if (!bridgeReady) {
    if (await probe('http://127.0.0.1:9527/')) {
      bridgeReady = true
      mark('bridge-ready', '127.0.0.1:9527 healthy')
    }
  }
  if (!webReady) {
    // netstat 快照 → 127.0.0.1 高位监听端口 → 逐端口探测 DSH 页面
    const { execSync } = await import('node:child_process')
    try {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8', timeout: 8000 })
      const ports = new Set()
      for (const match of out.matchAll(/TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING/g)) {
        ports.add(Number(match[1]))
      }
      for (const port of ports) {
        if (port <= 10000 || port === 1420) continue
        if (await probePage(`http://127.0.0.1:${port}/`)) {
          webReady = true
          mark('dsh-web-ready', `http://127.0.0.1:${port}`)
          break
        }
      }
    } catch {
      /* 扫描失败则继续 */
    }
  }
  if (bridgeReady && webReady) break
  await new Promise((r) => setTimeout(r, 250))
}

// 4. 汇总
console.log('\n[measure] 结果：')
for (const [name, m] of Object.entries(milestones)) {
  console.log(`  ${name.padEnd(16)} ${m.ms}ms ${m.detail}`)
}
if (!webReady) console.log('  WARN: DSH web 未在 90s 内就绪')

// 5. 清理（进程树 + sidecar node 子进程）
try {
  execSync(`taskkill /IM dsh-platform.exe /F /T`, { stdio: 'ignore' })
} catch {
  /* noop */
}
try {
  const { execSync: exec } = await import('node:child_process')
  const out = exec(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -match 'bin.js web' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
    { encoding: 'utf8', timeout: 10000 }
  )
  void out
} catch {
  /* noop */
}
console.log('[measure] 清理完成')
process.exit(webReady ? 0 : 1)
