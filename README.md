# dsh-platform

基于 DeepSeek Harness (DSH) 的跨端桌面 / 移动 / 鸿蒙客户端壳。DSH 源码以 git submodule 方式挂载（`harness/`，只读，零源码侵入），所有扩展通过 Cordis patch 注入。

## 核心架构

| 端 | 壳技术 | DSH 集成 |
| --- | --- | --- |
| 桌面 (Win/macOS/Linux) | Tauri v2 (Rust) | Node.js Sidecar（本机进程） |
| Android / iOS | Tauri Mobile | 远程连接（HTTP/WS 桥接） |
| HarmonyOS NEXT | ArkTS + ArkWeb | 远程连接 + HMS Push 桥接 |

- **Monorepo**：pnpm workspace + turbo
- **共享协议**：`packages/shared-bridge`（TypeScript，HTTP/WS 桥接）
- **共享前端**：`packages/shared-ui`（Vue 3 + Vite，编译到各端 WebView）
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
apps/desktop        桌面端（Tauri v2 + Vue 壳）
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

# 1) 初始化（submodule + workspace 安装）
git submodule update --init --recursive
pnpm install
pnpm prepare:harness        # 校验 submodule / 渲染 config/*.generated.yml
pnpm prepare:external       # 校验 external-plugins.json 声明的外部插件

# 2) 打包桌面端（推荐直接用 Tauri 的 dev 流程）
cd apps/desktop
pnpm tauri dev              # 启动 Rust 壳 → sidecar → DSH Web UI

# 3) 无壳冒烟：直接驱动 DSH web profile
node scripts/smoke-sidecar.mjs
```

## 关键约束

1. **DSH 源码零修改**：`harness/` 下任何文件不得修改（`git -C harness diff --stat` 必须为空）
2. **Patch 注入**：所有 DSH 扩展通过 `--patch config/*.generated.yml` 或 `cordis.patch.yml` 注入
3. **Seam 优先**：插件只使用 `ctx.tools` / `ctx.llm` / `ctx.sessions` 等公开 seam
4. **可逆 effect**：所有 Cordis effect 提供清理函数
5. **错误静默**：桥接通信失败不阻塞 DSH 核心功能

## 子项目版本记录

- `harness/`：DSH `dsh-v0.1.0-rc.8`（见 `HARNESS_UPSTREAM.md`）
- 本仓库运行时依赖 `@deepseek-ai/dsh@0.1.1-rc.2`（npm，sidecar 回退路径），与 submodule 的 `apps/cli` 结构一致（`lib/bin.js`）

## 相关文档

- DSH 官方仓库：https://github.com/deepseek-ai/deepseek-harness
- Cordis：https://github.com/cordiverse/cordis
- Tauri v2：https://tauri.app/
- 参考实现：https://github.com/anywhere-labs/dsh-desktop
