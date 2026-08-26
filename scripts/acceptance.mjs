#!/usr/bin/env node
/**
 * acceptance — 一键验收：执行所有可自动验证项并输出中文验收报告。
 *
 * 覆盖（对应目标提示词 §6 验证标准）：
 *   1. harness 子模块零修改          （§7 约束 1）
 *   2. overlay 渲染                  （prepare-harness）
 *   3. 插件形态校验                  （§6.2: apply/effect/ctx.get）
 *   4. TS 全量 typecheck + build     （§6.2）
 *   5. Rust test + clippy -D warnings（§6.2）
 *   6. 端到端冒烟                    （§6.1 验证 2/3/4 链路）
 *
 * 用法：node scripts/acceptance.mjs [--skip-smoke]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const skipSmoke = process.argv.includes('--skip-smoke')

const results = []
function run(name, command, args, options = {}) {
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: options.cwd ?? repoRoot, shell: true })
  const ok = !result.error && result.status === 0
  results.push({ name, ok, detail: result.error ? result.error.message : '' })
  return ok
}

console.log(`============== dsh-platform 验收（${new Date().toLocaleString('zh-CN')}）==============`)

// 1. harness 零修改
{
  const status = spawnSync('git', ['-C', 'harness', 'status', '--porcelain'], { encoding: 'utf8' })
  const diff = spawnSync('git', ['-C', 'harness', 'diff', '--stat'], { encoding: 'utf8' })
  const ok = status.status === 0 && status.stdout.trim() === '' && diff.stdout.trim() === ''
  results.push({ name: 'harness 子模块零修改', ok, detail: ok ? 'diff 为空' : status.stdout.trim() })
  console.log(`\n=== harness 子模块零修改 ===\n${ok ? '通过（diff 为空）' : '失败'} `)
}

// 2-6
run('overlay 渲染（prepare-harness）', 'node', ['scripts/prepare-harness.mjs'])
run('插件形态校验（6.2）', 'node', ['scripts/verify-plugin-shape.mjs'])
run('TS 全量 typecheck + build（24 包）', 'pnpm', ['exec', 'turbo', 'run', 'typecheck', 'build'])
run('Rust 单元测试（workspace）', 'cargo', ['test', '--workspace'])
run('Rust clippy（-D warnings 零警告）', 'cargo', ['clippy', '--workspace', '--', '-D', 'warnings'])
if (!skipSmoke) {
  run('端到端冒烟（DSH web + 插件注入 + 桥流量）', 'node', ['scripts/smoke-sidecar.mjs'])
}

// 引用性检查（非门禁）
const keyFiles = [
  'apps/desktop/src-tauri/src/sidecar.rs',
  'packages/shared-bridge/src/protocol.ts',
  'plugins/dsh-plugins/desktop-bridge/src/index.ts'
]
const filesOk = keyFiles.every((file) => existsSync(join(repoRoot, file)))
results.push({ name: '结构完整性（关键文件存在）', ok: filesOk, detail: keyFiles.join(', ') })

// Workflow 静态校验（防止手改失误破坏 CI/发布）
{
  try {
    const ci = load(readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8'))
    const release = load(readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8'))
    const ciSteps = ((ci?.jobs?.desktop?.steps) ?? []).map((step) => step.name ?? '')
    const check = (list, needle) => list.some((name) => String(name).includes(needle))
    const ok =
      ci !== null && release !== null &&
      check(ciSteps, 'TypeScript') && check(ciSteps, 'clippy') && check(ciSteps, '冒烟') &&
      release?.on?.workflow_dispatch !== undefined &&
      (release?.on?.push?.tags ?? []).includes('v*') &&
      check((release?.jobs?.['package-windows']?.steps ?? []).map((s) => s.name ?? ''), '上传安装包产物') &&
      check((release?.jobs?.['package-windows']?.steps ?? []).map((s) => s.name ?? ''), '发布 GitHub Release')
    results.push({ name: 'CI/发布 workflow 结构校验', ok, detail: ok ? 'ci.yml + release.yml 关键步骤齐全' : '结构异常，需检查 workflow' })
  } catch (err) {
    results.push({ name: 'CI/发布 workflow 结构校验', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
}

// 报告
console.log('\n\n================ 验收报告 ================')
let failed = 0
for (const item of results) {
  if (!item.ok) failed += 1
  console.log(`  ${item.ok ? '✅ PASS' : '❌ FAIL'}  ${item.name}${item.detail ? `（${item.detail}）` : ''}`)
}
console.log(`\n结果：${results.length - failed}/${results.length} 通过${failed ? `；${failed} 项失败` : ' —— 全部通过'}`)
console.log('参考：CI 实时状态 https://github.com/ChuGe1206/dsh-platform/actions\n')
process.exit(failed === 0 ? 0 : 1)
