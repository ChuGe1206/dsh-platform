#!/usr/bin/env node
/**
 * demo-market-registry — 本地插件注册表演示（Task 3.3 dsh-market 端到端）。
 *
 * 启动一个本地 HTTP 注册表（127.0.0.1:9530），以 external-plugins.json 为
 * 数据源响应 registry 请求；配合已配置 registry_url 的 dsh-market 插件
 * （config/desktop-overlay.yml 指向 https://registry.dsh.example.com 时
 * 无法联调，本脚本提供可本地联调的端点）。
 *
 * 用法：
 *   node scripts/demo-market-registry.mjs [--port 9530]
 *
 * 然后在 DSH 里调用市场工具：
 *   market_search { query: "desktop" }
 *   market_install { id: "dsh-plugin-desktop" }
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const manifestPath = join(repoRoot, 'external-plugins.json')
const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] ?? 9530)

if (!existsSync(manifestPath)) {
  console.error('[demo-market-registry] external-plugins.json 不存在')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const catalog = (manifest.plugins ?? []).map((plugin) => ({
  id: plugin.id,
  package: plugin.package,
  platforms: plugin.platforms,
  enabled: plugin.enabled,
  description: plugin.description ?? '',
  source: plugin.source
}))

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  if (url.pathname === '/' || url.pathname === '/api/registry') {
    res.writeHead(200)
    res.end(JSON.stringify({ registry: `http://127.0.0.1:${port}`, plugins: catalog }, null, 2))
    return
  }
  res.writeHead(404)
  res.end(JSON.stringify({ error: `unknown endpoint ${url.pathname}` }))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[demo-market-registry] 本地注册表已启动: http://127.0.0.1:${port}`)
  console.log(`[demo-market-registry] 目录条数: ${catalog.length}`)
  console.log(`[demo-market-registry] 用法: market_search { query: "desktop" } 或 curl http://127.0.0.1:${port}/api/registry`)
})
