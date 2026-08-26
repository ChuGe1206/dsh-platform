# 变更日志（中文）

## 2026-08-27 — v0.1.x 发布闭环与版本规范（19-24 轮）

- **v0.1.1 Release 发布成功**（run#6 全绿）：修复"网页建 tag 不触发 Actions"与
  "同 SHA force 无效"事件问题（删除+重推 + API 确认）；发布资产 1.95MB
- **版本规范落地**：三处版本（apps/desktop/package.json、tauri.conf.json、
  Cargo.toml workspace.package）同步 0.1.1；RELEASING.md 记录"tag 前 bump 三处"
- **一键验收工具**：scripts/acceptance.mjs（8 项：harness 零修改 / overlay 渲染 /
  插件形态 / TS 24 包 / cargo test / clippy -D warnings / 端到端冒烟 / 结构完整性），
  每轮全绿（8/8）
- **交付对账表**：docs/CHECKLIST.md（Phase/验证标准/约束逐项：实现/证据/状态）
- README：CI 与 Release 徽章 + 一键验收说明

## 2026-08-27 — v0.1.0 发布与运行引导（15-18 轮）

- **发布运行时方案定型**：安装包保持轻薄（≈2MB）+ 三重运行时来源（`DSH_PLATFORM_RUNTIME` 环境变量 / `install_runtime` 在线引导至 app_data / npm 全局 `npm -g`）；`sidecar.rs resolve_cli` 五级候选链
- **运行引导 UI 闭环**：`install_runtime` + `runtime_status` 命令；前端错误态"安装 DSH 运行时"按钮（自动重试、手动 npm -g 提示）
- **真实发布验证**：`pnpm tauri build` → NSIS 1.9MB / MSI 2.75MB；`v0.1.0` tag → GitHub Actions 自动 Release（含安装包资产）；排错 4 轮（spawn shell / symlink dereference / workspace target 路径 / gh CLI）
- **CI 流水线**：ci.yml（14 步全量门禁：子模块/插件形态/TS/cargo test/clippy -D warnings/端到端冒烟）+ release.yml（v* tag → build-all → tauri build → 上传 + gh CLI 发布），10+ 次运行全部通过
- **文档**：docs/ARCHITECTURE / PERFORMANCE / EXTERNAL-PLUGINS / UPGRADING / CHANGELOG（中文）+ README 徽章与验证记录

## 2026-08-26 — dsh-platform v0.1.0（里程碑：桌面端 MVP 完成）

### Phase 1 基础架构
- Monorepo：pnpm workspace + turbo + cargo workspace（4 个 crate）
- `harness/` 子模块固定 DSH `dsh-v0.1.0-rc.8`（上游真实提交 `141eb6fe`；零源码侵入）
- `packages/shared-bridge`：DSH 事件/桥接请求/响应协议 + BridgeClient（超时/静默失败/原生转发）
- `packages/shared-dsh`：sidecar（ready 行解析）、patch-loader（overlay 渲染）、plugin-registry、RemoteClient
- `packages/shared-ui`：Vue3 主题系统 + useTheme/useBridge/useDSH + Sidebar/ChatPanel/Composer
- `packages/shared-rust`：serde 线协议类型（与 TS 镜像，含单元测试）

### Phase 2 桌面端 MVP
- Tauri v2 壳：sidecar.rs（spawn/ready 解析/stderr 尾）、bridge.rs（127.0.0.1:9527 原生桥 + CORS + 通知路由）、desktop/notify/shortcut/updater 命令、自定义标题栏 + iframe 壳
- 插件注入：desktop-overlay（file:// URL 渲染机制）、5 个 DSH 插件（desktop-bridge / dsh-attachments / dsh-session-backup / dsh-market / dsh-lan-access）
- 启动脚本：prepare-harness / prepare-external-plugins / build-all / publish-harmony / smoke-sidecar / measure-startup / demo-market-registry

### Phase 3 插件生态
- desktop-bridge：回合通知 / 5s 状态上报 / 主题同步 / 文件拖放（实测：桥收到 POST /status）
- dsh-attachments：附件工具（add/list/remove/summary）+ 拖放入库
- dsh-session-backup：定时快照 + 旋转 + gzip（可逆 effect）
- dsh-market：market_search / market_install + 本地注册表演示
- 原生插件 ×12（desktop/mobile/harmony 接口包装）；global-shortcut 与 system-tray 实体落地（托盘菜单：显示/隐藏/重启 DSH/退出）

### Phase 4 跨端（脚手架，开发已暂停——工具链缺失）
- mobile-android / mobile-ios（Tauri Mobile，remote 模式；已纳入 cargo workspace 编译验证）
- harmonyos（ArkTS + ArkWeb + HarmonyBridge + HMS Push/软总线；H5 构建链路验证）

### 关键集成事实（实测/源码核实）
- DSH loader 插件行 `name` 在 Windows 必须是 file:// URL（裸绝对路径报 `e:` scheme）
- launcher 选项（`--patch`）必须位于透传参数（`--host/--port/--no-open`）之前
- Cordis v4 可选服务必须 `ctx.get()`（直接访问未声明服务抛错）
- 事件名核实：`turn/start`、`turn/end` 为 DSH 真实事件（agent-loop `session.append`）
- HMR 调查：覆盖启用无副作用但未观测到重载行为（官方基线 disabled，采用 restart 方案）

### 验证结果
- ✅ 实机（tauri dev）：窗口 → 预启动 sidecar → DSH Web UI（标题 "DeepSeek Harness"）
- ✅ 桥全路由：notify/status/theme-sync/hms-push + OPTIONS CORS 预检
- ✅ cargo check/clippy（0 警告）/test 全绿；TS 24 包 typecheck+build 全绿
- ✅ 性能：壳 6.65MB（release）、内存 41.2MB、壳启动 ~2.3s；DSH 首启 ~64s（预启动/常驻策略已落地前一半）

### 推送
- 仓库：https://github.com/ChuGe1206/dsh-platform.git（main 已包含全部里程碑）
