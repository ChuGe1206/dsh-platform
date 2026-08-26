# native-system-tray

系统托盘（Tauri 桌面壳，Phase 3.4 已落地）。Rust 侧（`src-tauri/src/tray.rs`，需要
`tauri` 的 `tray-icon` feature）构建托盘图标与菜单：
`显示窗口 / 隐藏窗口 / 重启 DSH / 退出`，菜单动作通过 `tray/menu` 事件
（payload `{ action }`）转发给 WebView；双击图标聚焦主窗口。WebView 通过
`set_tray_status` 同步 DSH 状态（idle/starting/ready/error）。

```ts
import { onTrayAction, setTrayStatus } from '@dsh-platform/native-system-tray'

await onTrayAction((action) => console.log(action))
await setTrayStatus('ready', 'DSH 已就绪')
```
