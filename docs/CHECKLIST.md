# 交付验收对账表（对应目标提示词 §5/§6/§7）

> 更新时间：2026-08-27（第 22 轮）。每项给出：目标要求 / 实现 / 证据 / 状态。

## Phase 1 基础架构（必须完成）

| 任务 | 实现 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1.1 Monorepo（package.json / pnpm-workspace / turbo） | ✅ 已建 | 根目录三件套 + cargo workspace（4 crate） | ✅ |
| 1.2 harness submodule = dsh-v0.1.0-rc.8 | ✅ 已建 | HARNESS_UPSTREAM.md；`git -C harness status` 为空 | ✅ |
| 1.3 shared-bridge（protocol/types/client） | ✅ | `packages/shared-bridge/src/` 三文件 | ✅ |
| 1.4 shared-dsh（sidecar/patch-loader/plugin-registry） | ✅ | `packages/shared-dsh/src/`（+remote-client） | ✅ |
| 1.5 shared-ui（Vue3 + 主题 + useDSH + useBridge） | ✅ | `packages/shared-ui/src/` | ✅ |

## Phase 2 桌面端 MVP（必须完成）

| 任务 | 实现 | 证据 | 状态 |
| --- | --- | --- | --- |
| 2.1 src-tauri（Cargo/conf/main/sidecar） | ✅ | 启动时序实测：窗口→sidecar→DSH UI 200 | ✅ |
| 2.2 Commands（desktop/notify/shortcut） | ✅ | 16 条命令；桥路由实测 | ✅ |
| 2.3 前端壳（App/TitleBar/HarnessFrame/useSidecar） | ✅ | dev/release 双形态验证 | ✅ |
| 2.4 desktop-bridge 插件 | ✅ | 5s 状态上报到达 9527（桥流量证据） | ✅ |
| 2.5 config/desktop-overlay.yml | ✅ | prepare 渲染 generated；smoke 断言 | ✅ |
| 2.6 启动脚本（prepare-harness/build-all） | ✅ | 均实跑成功（build-all 全绿） | ✅ |
| 2.7 启动时序验证 | ✅ 实机 | `tauri dev` + release exe 全链路（窗口 25.4MB/DSH web 200） | ✅ |

## Phase 3 插件生态（按需实现）

| 任务 | 实现 | 证据 | 状态 |
| --- | --- | --- | --- |
| 3.1 dsh-attachments | ✅ | 工具+拖放存储；形态校验过 | ✅ |
| 3.2 dsh-session-backup | ✅ | 增量快照+旋转+gzip；effect 带清理 | ✅ |
| 3.3 dsh-market | ✅ | search/install 工具 + 本地注册表演示 | ✅ |
| 3.4 native-plugins-desktop/* | global-shortcut ✅ / system-tray ✅（实体托盘实测）/ auto-updater ⏸ | 需发布签名密钥（docs/UPGRADING.md 指南就绪） | 部分 |

## Phase 4 跨端（按要求暂停）

| 任务 | 状态 |
| --- | --- |
| 4.1 mobile-android / 4.2 mobile-ios / 4.3 harmonyos | ⏸ 脚手架完成（含 cargo workspace 编译验证 + H5 构建链路），真机开发暂停（本机无 Android SDK/NDK/DevEco） |
| 4.4 remote-client.ts / 4.5 各端 overlay | ✅ 已完成（browser 子导出 + mobile/harmony overlay） |

## 验证标准

| 标准 | 状态 | 说明 |
| --- | --- | --- |
| 6.1 验证 1 结构 | ✅ | acceptance 脚本结构项 PASS |
| 6.1 验证 2 DSH 启动 | ✅ 实机 | 两次完整启动（dev/release） |
| 6.1 验证 3 插件注入 | ✅（替代证据） | /api/plugins 404 → 桥 POST /status 流量 |
| 6.1 验证 4 桥接通信 | ✅ 链路 | 桥路由全验证；真实回合通知需 API Key（人工项） |
| 6.1 验证 5 热重载 | ⚠️ 已调查 | 官方禁用 hmr；restart 方案（记录） |
| 6.2 代码质量 | ✅ | cargo check/clippy(-D warnings)/test、TS 24 包、插件形态全绿 |
| 6.3 性能 | ✅（除 DSH 首启） | 安装包 1.95MB（<20MB）/壳启动 30ms/内存 25.4MB；DSH 首启 64s（预启动+常驻策略） |

## 关键约束

| 约束 | 验证 |
| --- | --- |
| 1 DSH 零修改 | ✅ `git -C harness status/diff` 为空（每轮验收复查） |
| 2 Patch 注入 | ✅ 全部扩展经 overlay；无 harness 内插件 |
| 3 Seam 优先 | ✅ 插件仅 ctx.get(tools/sessions/commands) + ctx.logger |
| 4 可逆 effect | ✅ verify-plugin-shape 断言所有 effect 有清理 |
| 5 错误静默 | ✅ 桥接失败不抛出（客户端 failSilent + 插件 try/catch） |

## 自动化复核

```bash
node scripts/acceptance.mjs   # 8 项全 PASS（本地一键）
# CI：https://github.com/ChuGe1206/dsh-platform/actions （每次 push 自动 14 步）
```
