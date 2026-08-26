#!/usr/bin/env node
/**
 * verify-plugin-shape — 验证标准 6.2 自动化断言：
 *   - 每个 DSH 插件导出 name（字符串）/ apply（函数）
 *   - apply 源码中每个 `ctx.effect(` 调用都有清理函数（return () => …）
 *   - 无残留 `inject = ['logger']` 等无效注入（本栈 logger 非注入服务）
 *
 * 用法：node scripts/verify-plugin-shape.mjs
 * 退出码：0 = 全部通过
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const plugins = [
  'desktop-bridge',
  'dsh-attachments',
  'dsh-session-backup',
  'dsh-market',
  'dsh-lan-access'
]

let problems = 0

for (const id of plugins) {
  const entry = join(repoRoot, 'plugins', 'dsh-plugins', id, 'lib', 'index.js')
  const source = join(repoRoot, 'plugins', 'dsh-plugins', id, 'src', 'index.ts')
  if (!existsSync(entry) || !existsSync(source)) {
    console.log(`[verify] ${id}: 缺构建产物或源码（先 pnpm build）`)
    problems += 1
    continue
  }

  const module = await import(pathToFileURL(entry).href)
  const checks = []
  if (typeof module.name !== 'string' || module.name !== id) {
    checks.push(`name 导出异常: ${String(module.name)}`)
  }
  if (typeof module.apply !== 'function') {
    checks.push('缺少 apply(ctx, config)')
  }
  if ('inject' in module && Array.isArray(module.inject) && module.inject.includes('logger')) {
    checks.push('inject 含 logger（本栈非注入服务，改用 ctx.logger）')
  }

  const text = readFileSync(source, 'utf8')
  const effectCalls = (text.match(/ctx\.effect\(/g) ?? []).length
  const cleanupReturns = (text.match(/return \(\) =>/g) ?? []).length
  if (effectCalls > cleanupReturns) {
    checks.push(`effect 数 ${effectCalls} > 清理函数数 ${cleanupReturns}`)
  }
  // 剔除注释后的源码检查（注释中的 ctx.sessions 等文本不参与判定）
  const codeOnly = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
  const getServices = (codeOnly.match(/\(ctx as any\)\.get\?\.\('(tools|sessions|commands)'\)|ctx\.get\?\('(tools|sessions|commands)'\)/g) ?? []).length
  const directAccess = /\(ctx as Record<string, any>\)\.(tools|sessions|commands)\b/.test(codeOnly)
  if (getServices === 0 && directAccess) {
    checks.push('疑似直接访问未声明服务（应使用 ctx.get()）')
  }

  if (checks.length > 0) {
    problems += 1
    console.log(`[verify] ${id}: ❌ ${checks.join('；')}`)
  } else {
    console.log(`[verify] ${id}: ✅ name/apply 正常；effect=${effectCalls} 全部带清理；seam 访问 ${getServices} 处 via ctx.get`)
  }
}

console.log(problems === 0 ? '\n[verify] 全部插件形态校验通过' : `\n[verify] ${problems} 个问题`)
process.exit(problems === 0 ? 0 : 1)
