# desktop-bridge

DSH ↔ 原生壳桥接插件（Cordis）：

- **回合完成通知** — 监听 `agent/turn-stopping` / `turn/end`，POST `/notify`（或 `/hms-push`）
- **状态上报** — 每 5s POST `/status`（effect 附清理函数）
- **主题同步** — `web/theme-changed` → POST `/theme-sync`
- **文件拖放**（local 模式） — `desktop/file-drop` → POST `/file-drop`

桥接失败一律静默，不阻塞 DSH 核心功能。协议定义为 `packages/shared-bridge`。

## 配置

```yaml
- id: desktop-bridge
  name: '…/plugins/dsh-plugins/desktop-bridge/lib/index.js'   # 由 prepare:harness 渲染
  config:
    mode: local          # local | remote
    native_port: 9527
    remote_endpoint: http://127.0.0.1:9527   # 仅 remote 模式使用（移动/鸿蒙为设备端点）
    use_hms_push: false  # true 时走 /hms-push（鸿蒙）
    debounce_ms: 1500
```

## 构建

```bash
pnpm --filter @dsh-platform/desktop-bridge build   # 产出 lib/index.js（DSH loader 直接 import）
```
