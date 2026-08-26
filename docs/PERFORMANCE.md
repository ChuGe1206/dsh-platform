# 性能指标（验证标准 6.3）

| 指标 | 目标 | 实测（本机 Windows，2026-08-26） | 状态 |
| --- | --- | --- | --- |
| 安装包体积 | < 20 MB | **NSIS 1.9 MB / MSI 2.75 MB**（`pnpm tauri build` 产物，2026-08-26 实测） | ✅ 达标（注意：见"发布运行时"） |
| 启动时间 | < 3 s（点击 → DSH UI 可交互） | 壳部分 **~2.3 s**（进程 → 原生桥 :9527 健康）✅；DSH UI 就绪 **~64 s**（sidecar 冷启动）❌ | 部分 |
| 内存占用 | < 80 MB（Tauri 壳本身） | **41.2 MB**（`dsh-platform.exe` WorkingSet，窗口实测） | ✅ |

> **发布运行时（最终方案，2026-08 落地）**：安装包保持轻薄（壳 + 协议 ≈2MB）。
> sidecar 的 DSH CLI 按顺序解析（`sidecar.rs resolve_cli`）：
> ① `DSH_PLATFORM_RUNTIME` 环境变量 → ② `<app_data_dir>/runtime`（发布形态首次
> 引导：`install_runtime` 命令在线 `npm install @deepseek-ai/dsh@0.1.1-rc.2` 至
> 数据目录）→ ③ **npm 全局安装**（`npm root -g`，用户手动 `npm -g install`
> / `npx` 即属此路径，已实测 0.1.1-rc.2 可用）→ ④ 仓库 submodule/根依赖（dev）。
> 说明：DSH Node 全家桶体积远超 20MB 目标，因此不打包进安装包（架构决策），
> 文档化取舍：①运行时在线安装（本方案，安装包最小）②完整运行时打包（接受
> 体积超标）③依赖白名单精简（后续）。

## 实测方法（可复现）

```bash
node scripts/measure-startup.mjs    # 输出 vite-ready / bridge-ready / dsh-web-ready 各阶段耗时
```

测量脚本自动：启动 vite → 启动 `target/debug/dsh-platform.exe` → 轮询
`127.0.0.1:9527`（壳/桥就绪）与 DSH Web 页面（HTTP 200 且含 "DeepSeek"，
证明 UI 可交互）→ 输出各阶段毫秒并清理进程树。

## 结论与优化建议

1. **壳层达标**：从进程启动到 WebView 挂载 + 原生桥就绪约 2.3s，符合
   "<3s（壳）" 预期；preview 中 41.2MB 内存远低于 80MB 基线。
2. **已落地：sidecar 预启动**（`lib.rs` setup 阶段立即并行拉起 DSH，
   `start_sidecar` 命令幂等）——窗口出现时 DSH 已在预热，前端挂载即拿
   到就绪地址；配合托盘"隐藏窗口"常驻模式，用户再次唤回时 DSH 响应
   为亚秒级。
3. **DSH UI 首次就绪 ~64s** 为 node + DSH web profile 装载的固有成本，
   <3s 目标需依赖上述常驻/预启动策略（产品层）——
   - 安装时生成 profile 快照（prepare-harness 已可渲染 overlay，
     发布包内置预装 profile 可显著缩短首次启动）；
   - sidecar 常驻用户会话（托盘"重启 DSH"/隐藏窗口已具备生命周期能力）。
4. **打包体积测量**：release 二进制 6.65MB；完整安装包（NSIS/MSI）需
   `pnpm tauri build`（需 WiX/NSIS 下载，CI 建议在 GitHub Actions 上执行）。
   harness 源资源（runtime/harness/apps/cli）已列入 `tauri.conf.json`
   bundle.resources；发布时建议只打包 `apps/cli` 构建产物 + node runtime
   （约 5-10 MB）。

## 基线数据（本机记录）

| 测量项 | dev（vite + debug 壳） | **发布形态（release exe，无 vite）** |
| --- | --- | --- |
| vite-ready | ~7.0 s（首次）/ ~0.05 s（热） | 0（内嵌前端） |
| bridge-ready（壳+桥） | ~2.3 s（热） | **~0.03 s** |
| dsh-web-ready | ~64 s（sidecar 冷启动） | ~64 s（sidecar 冷启动，同源） |
| 窗口内存 | 41.2 MB | **25.4 MB** |

> 发布形态附加说明：release 二进制内嵌前端（无 vite 依赖），壳与桥
> 30ms 级就绪；DSH UI 就绪仍由 sidecar 冷启动主导（约 60s → 64s），
> 依赖预启动/常驻策略（已落地：setup 预启动 + 托盘常驻）。
