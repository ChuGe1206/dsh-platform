# 架构说明（中文）

> dsh-platform：基于 DeepSeek Harness (DSH) 的跨端客户端壳。
> 本文档为中文架构总览，对应目标提示词「2. 架构设计规范 / 3. 接口与时序规范」。

## 1. 总体结构

```
┌─────────────────────────────────────────────────────────────┐
│                     共享层（各端复用）                        │
│  packages/shared-bridge   线上协议 + BridgeClient（HTTP 桥）    │
│  packages/shared-dsh      sidecar/overlay/registry/远程客户端   │
│  packages/shared-ui       Vue3 UI 套件（组件/组合式函数/主题）   │
│  packages/shared-rust     Rust 侧线协议类型（与 TS 镜像）       │
└──────────────┬──────────────────────────────┬────────────────┘
               │                              │
   ┌───────────▼────────────┐      ┌──────────▼──────────────┐
   │ apps/desktop (Tauri v2)│      │ apps/mobile-* / harmony │
   │ · sidecar.rs 托管 DSH   │      │ · RemoteClient 远程连接  │
   │ · bridge.rs (:9527 桥)  │      │ · 原生桥(移动/鸿蒙 :9527) │
   │ · tray/commands/...     │      │ · HarmonyBridge(ArkTS)   │
   └───────────┬────────────┘      └─────────────────────────┘
               │ spawn
   ┌───────────▼──────────────────────────────────────────────┐
   │ DSH (harness/ 只读 submodule, 零源码侵入)                  │
   │ node apps/cli/lib/bin.js web --patch config/*.generated.yml│
   │ ⇒ Cordis boot ⇒ 插件图（注入 desktop-bridge 等）          │
   └───────────────────────────────────────────────────────────┘
```

- 所有 DSH 扩展**只能**通过 `--patch overlay`（`config/*.yml` → 渲染为
  `*.generated.yml`）或 `cordis.patch.yml` 注入 —— 约束 #2。
- `harness/` 固定 DSH tag `dsh-v0.1.0-rc.8`（见 `HARNESS_UPSTREAM.md`），
  `git -C harness status/diff` 必须为空 —— 约束 #1。

## 2. 桌面端启动时序（已实机验证）

```
(pnpm tauri dev / 发布包)
 0. 预启动：Rust setup 阶段即并行 spawn sidecar（不等前端）；
    start_sidecar 命令幂等 —— 前端挂载后立即拿到已就绪地址。
 1. Tauri Rust setup：
    · bridge::spawn() → 原生桥监听 127.0.0.1:9527（CORS + BridgeResponse）
    · tray::create()  → 系统托盘（显示/隐藏/重启 DSH/退出，双击聚焦）
 2. 前端 App.vue → useSidecar.start() → invoke('start_sidecar')（返回既存 URL）
 3. Rust spawn sidecar：
    node <cli> web --patch <root>/config/desktop-overlay.generated.yml
       --host 127.0.0.1 --port 0 --no-open
    注: launcher 参数（--patch）必须位于透传参数（--host/--port/--no-open）
       之前 —— commander passThroughOptions 语义（实测确认）。
    注: 插件行 name 必须是 file:// 绝对 URL（Windows 实测：裸绝对路径
        会以 scheme 'e:' 到达 ESM loader 而失败）。
 4. DSH 输出 ready 行 dsh web: http://127.0.0.1:<PORT>
 5. Rust 解析并校验端口（拒绝 0 / 越界），emit 'harness-ready'
 6. WebView iframe 加载 http://127.0.0.1:<PORT>（sandbox 允许 same-origin/scripts/forms）
 7. desktop-bridge 插件激活 → 每 5s POST /status 到 :9527（插件生效证据）
 8. 桥接信封: POST /{method} → BridgeResponse { id, success, version }
    · /notify       → 系统通知（tauri-plugin-notification）
    · /file-drop    → bridge://file-drop 事件
    · /theme-sync   → bridge://theme-sync 事件
    · /status       → bridge://status 事件
    · /hms-push     → bridge://hms-push 事件（鸿蒙）
```

实测记录（本机 Windows，`pnpm tauri dev`）：窗口 "DSH Platform"（41.2 MB）
→ sidecar 子进程（--patch 正确解析）→ DSH Web UI HTTP 200（标题
"DeepSeek Harness"）→ 全程无错误。详见 README「验证记录」。

## 3. 桥接协议

见 `packages/shared-bridge/src/protocol.ts`：

- `DSHEvent`（DSH → 壳）：`session/start | session/event | turn/start |
  turn/end | agent/error | web/client/slot`
- `BridgeRequest`（WebView → 原生壳）：`{ id, method, payload }`，
  method ∈ `notify | status | file-drop | theme-sync | shortcut-trigger | hms-push`
- `BridgeResponse`：`{ id, success, data?, error?, version? }`
- 端点统一 `http://127.0.0.1:9527`（桌面/移动/鸿蒙，`NATIVE_ENDPOINTS`）
- 客户端 `BridgeClient`：超时 + 静默失败（约束 #5 —— 桥故障不阻断 DSH）

## 4. 插件注入机制（关键集成事实）

| 事实 | 说明 |
| --- | --- |
| overlay 模板 | `config/*.overlay.yml` 使用仓库根相对 `./plugins/...`（目标提示词格式） |
| 渲染 | `scripts/prepare-harness.mjs` 渲染为 `*.generated.yml`，把 `name` 换成 **file:// 绝对 URL**（指向插件 `lib/index.js` 构建产物） |
| 为什么 | DSH loader 只按「包名 / 相对路径 / file URL」import；裸 Windows 绝对路径会以 `e:` scheme 失败（实测） |
| 服务访问 | Cordis v4 Context Proxy 对未声明服务直接访问会抛错 —— 可选 seam 一律 `ctx.get('tools'|'commands'|'sessions')`（实测） |
| 注入 | 插件行不声明 `inject`；`logger` 非可用注入服务，用 `ctx.logger`（Cordis 内建） |
| 生效证据 | desktop-bridge 每 5s `POST /status` 到达 :9527（`smoke-sidecar.mjs` 自动断言；该 DSH 版本无 `/api/plugins` 端点） |

## 5. 各端差异

| 维度 | desktop | mobile-* | harmony |
| --- | --- | --- | --- |
| DSH 集成 | Node sidecar（本机进程） | RemoteClient（HTTP/WS，远程） | RemoteClient（远程） |
| 通知 | 系统通知（/notify） | 推送（push-notification） | HMS Push（/hms-push） |
| 附件 | 文件拖放（file-drop） | 系统选择器（file-picker） | SAF（file-access） |
| 桥 | Rust bridge.rs（tiny_http） | Rust bridge.rs | HarmonyBridge.ets + JS 代理 |
| overlay | desktop-overlay.yml | mobile-overlay.yml | harmony-overlay.yml |

## 6. 验证矩阵（对应目标 §6）

| 验证标准 | 状态 | 证据 |
| --- | --- | --- |
| 6.1 验证 2（DSH 启动） | ✅ 实机通过 | tauri dev 完整时序（窗口/桥/sidecar/UI 200） |
| 6.1 验证 3（插件注入） | ✅（替代证据） | /api/plugins 404 → 桥 POST /status 流量 |
| 6.1 验证 4（桥接通信） | ✅ | 桥健康 200 + 通知路由实现 |
| 6.1 验证 5（热重载） | ⚠️ 文档化 | 实测：overlay 覆盖 `- id: hmr / disabled: false` 可无副作用启用，但 20s 观察期未捕获任何 reload/hmr 输出（官方也注明该 HMR 生命周期未测试）；已回退官方基线，用 restart 替代（`restart_sidecar` / 托盘"重启 DSH"） |
| 6.2 代码质量 | ✅ | cargo check/clippy(0 警告)/test(3)、tsc 24/24、harness diff 空 |
| 6.3 性能指标 | 部分 | 内存 41.2MB ✅；体积/启动时间需 release 打包采集（docs/PERFORMANCE.md） |
