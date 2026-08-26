# dsh-platform

[![CI](https://github.com/ChuGe1206/dsh-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/ChuGe1206/dsh-platform/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ChuGe1206/dsh-platform)](https://github.com/ChuGe1206/dsh-platform/releases)

基于 DeepSeek Harness (DSH) 的跨端桌面 / 移动 / 鸿蒙客户端壳。DSH 源码以 git submodule 方式挂载（`harness/`，只读，零源码侵入），所有扩展通过 Cordis patch 注入。

## 核心架构

| 端 | 壳技术 | DSH 集成 |
| --- | --- | --- |
| 桌面 (Win/macOS/Linux) | Tauri v2 (Rust) | Node.js Sidecar（本机进程） |
| Android / iOS | Tauri Mobile | 远程连接（HTTP/WS 桥接） |
| HarmonyOS NEXT | ArkTS + ArkWeb | 远程连接 + HMS Push 桥接 |

- **Monorepo**：pnpm workspace + turbo
- **共享协议**：`packages/shared-bridge`（TypeScript，HTTP/WS 桥接）
- **共享前端**：`packages/shared-ui`（React + Vite，编译到各端 WebView）
- **共享 Node 集成**：`packages/shared-dsh`（sidecar / remote-client / patch-loader / plugin-registry）
- **共享 Rust 库**：`packages/shared-rust`（桥接类型与 JSON 工具）

## 启动时序（桌面端）

```
Tauri Rust → spawn sidecar (node harness/apps/cli/lib/bin.js web --host 127.0.0.1 --port 0 --patch config/desktop-overlay.yml)
          → DSH 输出 ready 行 "dsh web: http://127.0.0.1:<PORT>"
          → Rust 解析并校验端口
          → WebView 加载 http://127.0.0.1:<PORT>
          → 注入 __DSH_BOOT__，加载插件图
          → desktop-bridge 插件经 HTTP POST http://127.0.0.1:9527/* 与原生壳通信
```

## 目录速览

```
apps/desktop        桌面端（Tauri v2 + React 壳）
apps/mobile-*       Tauri Mobile 端
apps/harmonyos      HarmonyOS NEXT 端（ArkTS + ArkWeb）
packages/shared-*   共享协议 / 集成 / UI / Rust
plugins/            DSH 插件（Cordis patch）与原生插件 API 包
harness/            DSH git submodule（只读，见 HARNESS_UPSTREAM.md）
config/*.yml        各端 overlay 模板（prepare 脚本渲染为 *.generated.yml）
scripts/            prepare / build / publish 自动化
```

## 快速开始（开发环境）

```bash
# 0) 前置：Node >= 22, pnpm >= 9, Rust stable (cargo 1.77+), Tauri 系统依赖
# 1) 从 GitHub 克隆（子模块一并拉取）
git clone --recurse-submodules https://github.com/ChuGe1206/dsh-platform.git
cd dsh-platform

# 2) 初始化（workspace 安装）
pnpm install
pnpm prepare:harness        # 校验 submodule / 渲染 config/*.generated.yml
pnpm prepare:external       # 校验 external-plugins.json 声明的外部插件

# 3) 桌面端（Tauri dev：Rust 壳 → sidecar → DSH Web UI）
cd apps/desktop
pnpm tauri dev

# 4) 无壳冒烟：直接驱动 DSH web profile（验证插件注入与桥接链路）
node scripts/smoke-sidecar.mjs

# 5) 一键验收：全部自动验证项汇总（8 项，输出中文报告）
node scripts/acceptance.mjs
```

> 说明：本机对 GitHub 的 `git clone` 大包传输偶发被重置（`Recv failure`），
> 若 `git submodule update` 失败，可直接执行
> `git -C harness fetch https://github.com/deepseek-ai/deepseek-harness.git tag dsh-v0.1.0-rc.8 && git -C harness checkout dsh-v0.1.0-rc.8`。

## 关键约束

1. **DSH 源码零修改**：`harness/` 下任何文件不得修改（`git -C harness diff --stat` 必须为空）
2. **Patch 注入**：所有 DSH 扩展通过 `--patch config/*.generated.yml` 或 `cordis.patch.yml` 注入
3. **Seam 优先**：插件只使用 `ctx.tools` / `ctx.llm` / `ctx.sessions` 等公开 seam
4. **可逆 effect**：所有 Cordis effect 提供清理函数
5. **错误静默**：桥接通信失败不阻塞 DSH 核心功能

## 子项目版本记录

- `harness/`：DSH `dsh-v0.1.0-rc.8`（见 `HARNESS_UPSTREAM.md`）
- 本仓库运行时依赖 `@deepseek-ai/dsh@0.1.1-rc.2`（npm，sidecar 回退路径），与 submodule 的 `apps/cli` 结构一致（`lib/bin.js`）

## 验证记录（本机实测）

| 项 | 结果 |
| --- | --- |
| DSH 启动（`pnpm tauri dev`） | ✅ 窗口 "DSH Platform" → sidecar 启动 → DSH Web UI（HTTP 200，标题 "DeepSeek Harness"） |
| 插件注入 | ✅ desktop-bridge 每 5s 向原生桥 9527 上报 `POST /status`（`node scripts/smoke-sidecar.mjs` 自动断言）。说明：该 DSH 版本无 `/api/plugins` 端点（404），以桥流量作为插件激活证据 |
| 桥接通信 | ✅ 原生桥 9527 健康检查 `{"healthy":true,"protocolVersion":1}`；通知路由到系统通知 |
| 热重载 | ⚠️ 官方 web profile 的 `cordis.patch.yml` 显式 `- id: hmr / disabled: true`，插件热重载默认不生效；修改插件后重启 sidecar（`restart_sidecar` 命令 / 托盘"重启 DSH"） |
| 代码质量 | ✅ `cargo check` / `cargo clippy`（0 警告）/ `cargo test`（3/3）/ TS 类型检查 24/24 |
| DSH 零修改 | ✅ `git -C harness status/diff` 均为空 |

## 相关文档

- 架构说明（中文）：`docs/ARCHITECTURE.md`（模块图 / 启动时序 / 桥协议 / 插件注入机制 / 验证矩阵）
- 性能基线：`docs/PERFORMANCE.md`
- 自动更新接入：`docs/UPGRADING.md`
- 外部插件集成：`docs/EXTERNAL-PLUGINS.md`（三种路径 + 实测记录 + DSH 事件名核实）
- DSH 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- Cordis：https://github.com/cordiverse/cordis
- Tauri v2：https://tauri.app/
- 参考实现：https://github.com/anywhere-labs/dsh-desktop

> **开发状态（2026-08）：移动端（Android/iOS）与鸿蒙端开发已暂停** ——
> 当前机器缺少 Android SDK/NDK、Rust android target 与 DevEco Studio 工具链，
> 无法进行真机构建/联调。`apps/mobile-*` 与 `apps/harmonyos` 保留为脚手架
> （代码已纳入类型检查与 cargo workspace 编译验证），工具链就绪后即可恢复推进。
> 桌面端（Win/macOS/Linux）持续迭代中。

## CI 与发布（GitHub Actions）

- **`.github/workflows/ci.yml`**：push/PR 自动执行 —— harness 校验 → 插件形态校验 →
  TS 全量 typecheck+build → cargo test → clippy（`-D warnings` 零警告门槛）→
  端到端冒烟（DSH web + 插件注入 + 桥流量）
- **`.github/workflows/release.yml`**：`v*` tag（或手动触发）→ 全量构建 →
  `tauri build`（NSIS + MSI）→ 上传产物 + GitHub Release
- 发布运行时（DSH CLI 打包）策略见 `docs/PERFORMANCE.md`「发布运行时」
