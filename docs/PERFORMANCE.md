# 性能指标（验证标准 6.3）

| 指标 | 目标 | 测试方法（Tauri 发布构建） |
| --- | --- | --- |
| 安装包体积 | < 20 MB（桌面端） | `pnpm build:all` 后检查 `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe` 与 `msi/*.msi` |
| 启动时间 | < 3 s（点击到 DSH UI 可交互） | 记录窗口创建 → `harness-ready` → iframe `load` 的时间线（前端 `performance.now()` 打点，或 `Measure-Command { Start-Process … }`） |
| 内存占用 | < 80 MB（Tauri 壳本身） | 任务管理器/`Get-Process dsh-platform` 的 WorkingSet（不含 sidecar 的 node 进程与 WebView 附加进程） |

## 说明

- 壳本身（Rust + WebView2）通常 40–70 MB；DSH sidecar（node + 静态前端）为
  独立进程，不在 80 MB 基线内。
- 启动时间主要受 sidecar 就绪影响（首次运行 DSH 冷启动 + 插件图装载）；`--patch`
  行数、node_modules 热度都会影响该值，基准测量应在 `pnpm build:all` 产物的
  release 包上进行。
- 本机（Windows）已通过 `cargo build --release` 编译链路；完整 release 打包与
  真机测量需要交互式桌面会话，本节为基线定义与测量方法，数值留待发布 CI 采集。
