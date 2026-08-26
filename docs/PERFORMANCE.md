# 性能指标（验证标准 6.3）

| 指标 | 目标 | 实测（本机 Windows dev 基线，2026-08-26） | 状态 |
| --- | --- | --- | --- |
| 安装包体积 | < 20 MB | 待 release 打包采集（`cargo build --release -p dsh-platform` 已发起；完整 bundle 需 `tauri build` + NSIS，见下方"打包体积测量"） | ⏳ |
| 启动时间 | < 3 s（点击 → DSH UI 可交互） | 壳部分 **~2.3 s**（进程 → 原生桥 :9527 健康）✅；DSH UI 就绪 **~64 s**（sidecar 冷启动）❌ | 部分 |
| 内存占用 | < 80 MB（Tauri 壳本身） | **41.2 MB**（`dsh-platform.exe` WorkingSet，窗口实测） | ✅ |

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
2. **DSH UI 就绪受 sidecar 冷启动主导**（~64s：node 进程 + DSH web profile
   数百插件装载）。<3s 目标需要**预启动/常驻**策略：
   - 壳启动即并行 spawn sidecar（当前已并行，但 WebView 需等 IPC）；
     可接受"启动即预热、就绪后自动刷新 iframe"的产品形态；
   - 安装时生成 profile 快照（`prepare-harness` 已可渲染 overlay，profile
     boot 缓存依赖 node_modules 安装，建议发布包内置预装 profile）；
   - 或 sidecar 常驻用户会话（托盘"重启 DSH"已具备 lifecycle 能力）。
3. **打包体积测量**：release 二进制构建完成后——
   `cargo build --release -p dsh-platform`（产物 `target/release/dsh-platform.exe`），
   完整安装包（NSIS/MSI）需 `pnpm tauri build`（需 WiX/NSIS 下载，CI 建议在
   GitHub Actions 上执行）。harness 源资源（runtime/harness/apps/cli）已列入
   `tauri.conf.json` bundle.resources；发布时建议只打包 `apps/cli` 构建产物 +
   node runtime（约 5-10 MB）。

## 基线数据（本机记录）

| 测量项 | 冷启动（首次） | 热启动（第二次） |
| --- | --- | --- |
| vite-ready | ~7.0 s | ~0.05 s（端口热） |
| bridge-ready（壳+桥） | ~7.0 s（含首次 vite 编译？不——vite 已就绪后 15ms） | ~2.3 s |
| dsh-web-ready | ~82 s | ~64 s |

> 注：首次测量包含 vite 首次冷启动（无缓存），第二次为常态值。
