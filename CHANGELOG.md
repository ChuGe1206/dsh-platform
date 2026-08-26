# 变更日志（中文）

## 2026-08-29 — splash 异形设计优化 + 启动切换修复

- **splash 改为海浪异形半透明设计**：`clip-path` 裁出不规则海浪上沿 + 纯半透明渐变
  (去掉 backdrop-filter),鲸鱼放低浸入浪面呈"破浪/跃浪"姿态,带白色喷雾水线与
  浮起动效;splash 窗口加大到 480×300。
- **修复启动一直停在 splash**：窗口切换由前端(hidden 主窗口的 WebView 是否运行 JS
  不确定)移到 **Rust 层**——启动后固定 3 秒(或更早就绪)即 `reveal_main` 显示
  主窗口并关闭 splash;主窗口自身 HarnessFrame 继续显示 DSH 加载态。

## 2026-08-29 — 启动窗口 / 标题栏按钮 / 版本统一

- **新增精美异形启动窗口(splash)**：主窗口启动时先隐藏,另开一个小尺寸(260×206)、
  居中、透明无边框、置顶的 `splash` 窗口,内含鲸鱼品牌+加载动画的圆角卡片视觉
  (`transparent`+`decorations:false` 在透明窗口上只显示圆角内容,形成"异形"外观)。
  DSH sidecar 就绪或失败后,前端显示主窗口并关闭 splash。
- **重构标题栏右上角按钮**：最小化/最大化/关闭改为**统一尺寸的 SVG 图标**
  (46×30,居中),最大化在已最大化时自动切换为"还原"图标,关闭按钮红底悬停,
  统一 hover/active 过渡。
- **版本号统一到单一来源**：新增 `config/version.json`(app/dsh 两值)与
  `scripts/sync-version.mjs`(`pnpm sync:version`)——把 `app` 写入根/各 workspace
  的 package.json、各 app 的 tauri.conf.json、Cargo.toml(workspace+shared-rust);
  把 `dsh` 写入根 package.json 的 `@deepseek-ai/dsh` 并生成
  `apps/desktop/src-tauri/src/version.rs`。`install_runtime` 改用 `version::DSH_VERSION`,
  不再写死;同步脚本"就地替换"版本值,不改动其它格式,避免触发 pnpm 全树清理。

## 2026-08-29 — 前端 Vue → React 迁移 + 启动黑框修复

- **前端框架 Vue 3 → React 18**：`packages/shared-ui`（3 组件 + 3 hooks）与
  `apps/desktop`（App/TitleBar/HarnessFrame/useSidecar）从 Vue SFC/组合式函数转为
  React TSX/hooks；`useTheme`/`useBridge`/`useDSH` 重写为 React hooks（返回纯值 +
  setter，不再返回 ref）。移动/鸿蒙端 shell（mobile-android / mobile-ios /
  harmonyos h5）同步转 React，保持 workspace 可构建。`theme.css`（设计 token +
  全局 `.dsh-*` 工具类）为框架无关，保留。
- 依赖调整：各前端 package.json 用 `react`/`react-dom`/`@types/react`/
  `@vitejs/plugin-react` 替换 `vue`/`vue-tsc`/`@vitejs/plugin-vue`；vite.config 用
  `plugin-react`，tsconfig 用 `jsx: react-jsx`。
- **修复发布版 node 黑框**：`sidecar.rs` spawn DSH 子进程、`install_runtime` spawn
  npm 均加 Windows `CREATE_NO_WINDOW`（`creation_flags(0x08000000)`）——发布版是
  GUI 子系统，node/npm（控制台程序）默认会额外弹黑框；dev（debug）有控制台故不弹。

## 2026-08-28 — 修复启动失败 / 卸载卡顿 / 应用图标（第 25+ 轮）

- **修复发布形态启动失败（"cannot resolve dsh-platform repo root"）**：
  `sidecar.rs` 的 `start()` 不再强制要求仓库根（`DSH_PLATFORM_REPO`）——此前
  安装后 `CARGO_MANIFEST_DIR` 指向不存在的 CI/构建路径即直接报错。现在
  `resolve_cli` / `resolve_overlay` 优先从「缓存运行时 / npm 全局 / dev 仓库」
  解析；找不到时返回 `DSH CLI not found`，由前端既有引导 UI 触发在线安装
  运行时（install_runtime）。同时为 overlay 增加"插件文件存在"校验，避免把
  打包进安装包的绝对路径（仅开发机有效）传给 DSH loader。
- **优化卸载卡顿（删除 node_modules 慢）**：`install_runtime` 的运行时改存到
  系统缓存目录 `<cache_dir>/dsh-platform/runtime`（Windows 为 `%LOCALAPPDATA%`），
  而非会被 NSIS 卸载器递归清空的 `app_data_dir`（`%APPDATA%\io.dsh.platform`）——
  卸载时不再逐文件遍历巨型 node_modules。DSH_HOME（profiles）按用户选择仍保留在
  `app_data_dir`。说明：钉子版 `tauri-build` 2.6.3 不支持 `deleteAppDataOnUninstall`
  字段（新版 CLI 有、Rust crate 无；2.6.3 已是当前最新兼容 2.x），故采用缓存目录方案。
- **应用图标改为 DeepSeek 黑鲸鱼**：以 `harness` ui-primitives 的 `FishLogo`
  鲸鱼 SVG 渲染为应用图标（`icon.png` / `icon.ico`，`tauri icon` 生成全部尺寸）。

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
